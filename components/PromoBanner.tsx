import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Alert, Animated, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, MIN_TOUCH_TARGET, radius, shadow, spacing, typography } from '@/constants/theme';
import {
  DEFAULT_REFILL_THRESHOLD,
  parseLocalISODate,
  resolveHomeRegion,
  toLocalISODate,
  type HomeRegion,
  type Medication,
  type SymptomLog,
} from '@/services/supabase';

// ---------------------------------------------------------------------------
// Trigger rules
// ---------------------------------------------------------------------------

export const HIGH_PAIN_THRESHOLD = 7;
export const URGENT_KEYWORDS = ['fever', 'migraine', 'severe'] as const;
/** Only logs from today and yesterday can raise the walk-in clinic banner. */
export const CLINIC_LOOKBACK_DAYS = 2;

// Prefix match so "fevers", "migraines" and "severely" also count.
const URGENT_KEYWORD_PATTERNS = URGENT_KEYWORDS.map((keyword) => ({
  keyword,
  pattern: new RegExp(`\\b${keyword}`, 'i'),
}));

export type PromoDecision =
  | { kind: 'walk_in_clinic'; log: SymptomLog; highPain: boolean; matchedKeywords: string[] }
  | { kind: 'pharmacy_refill'; medications: Medication[] }
  | { kind: 'primary_care' };

function findUrgentKeywords(log: SymptomLog): string[] {
  // extracted_tags is JSONB written by the AI scribe, so don't trust its shape.
  const tags = Array.isArray(log.extracted_tags)
    ? log.extracted_tags.filter((tag): tag is string => typeof tag === 'string')
    : [];
  const haystack = [log.raw_input ?? '', ...tags].join(' ');
  return URGENT_KEYWORD_PATTERNS.filter(({ pattern }) => pattern.test(haystack)).map(({ keyword }) => keyword);
}

function findUrgentLog(logs: SymptomLog[], now: Date) {
  const today = toLocalISODate(now);
  const earliest = toLocalISODate(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() - (CLINIC_LOOKBACK_DAYS - 1)),
  );

  const recentFirst = logs
    .filter((log) => log.log_date >= earliest && log.log_date <= today)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));

  for (const log of recentFirst) {
    const highPain = (log.pain_level ?? 0) >= HIGH_PAIN_THRESHOLD;
    const matchedKeywords = findUrgentKeywords(log);
    if (highPain || matchedKeywords.length > 0) {
      return { log, highPain, matchedKeywords };
    }
  }
  return null;
}

function findLowSupplyMedications(medications: Medication[]): Medication[] {
  return medications
    .filter(
      (med) =>
        (med.is_active ?? true) && med.current_supply <= (med.refill_threshold ?? DEFAULT_REFILL_THRESHOLD),
    )
    .sort((a, b) => a.current_supply - b.current_supply);
}

/**
 * Decides which Samy's promotions to show, most urgent first. Clinic and refill
 * triggers are independent and can both appear; the primary-care banner shows
 * only when neither fires.
 */
export function selectPromos(logs: SymptomLog[], medications: Medication[], now: Date = new Date()): PromoDecision[] {
  const promos: PromoDecision[] = [];

  const urgent = findUrgentLog(logs, now);
  if (urgent) promos.push({ kind: 'walk_in_clinic', ...urgent });

  const lowSupply = findLowSupplyMedications(medications);
  if (lowSupply.length > 0) promos.push({ kind: 'pharmacy_refill', medications: lowSupply });

  return promos.length > 0 ? promos : [{ kind: 'primary_care' }];
}

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------

// Search queries handed to the device's maps app. Swap these for exact street
// addresses or place IDs once each location is confirmed.
const walkInClinicQuery = (region: HomeRegion | null) =>
  region ? `Samy's Walk-In Clinic, ${region}, ON` : "Samy's Walk-In Clinic";
const familyClinicQuery = (region: HomeRegion | null) =>
  region ? `Samy's Family Clinic, ${region}, ON` : "Samy's Family Clinic";
const pharmacyQuery = (region: HomeRegion | null) =>
  region ? `Samy's Drug Mart, ${region}, ON` : "Samy's Drug Mart";

async function openMapsSearch(query: string): Promise<void> {
  const q = encodeURIComponent(query);
  const webUrl = `https://www.google.com/maps/search/?api=1&query=${q}`;
  const nativeUrl = Platform.select({
    ios: `https://maps.apple.com/?q=${q}`,
    android: `geo:0,0?q=${q}`,
  });

  try {
    await Linking.openURL(nativeUrl ?? webUrl);
  } catch {
    try {
      await Linking.openURL(webUrl);
    } catch {
      Alert.alert('Unable to open maps', `Search for "${query}" in your maps app.`);
    }
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type IconName = ComponentProps<typeof Ionicons>['name'];

export type PromoBannerProps = {
  logs: SymptomLog[];
  medications: Medication[];
  /** Raw `users.home_region` value; used to point maps at the nearest location. */
  homeRegion: string | null;
  /** Called with the low-supply medications (lowest supply first) when the refill card is tapped. */
  onRequestRefill: (medications: Medication[]) => void;
  /** Reference "today" for the clinic lookback window. Defaults to now. */
  now?: Date;
};

export default function PromoBanner({ logs, medications, homeRegion, onRequestRefill, now }: PromoBannerProps) {
  const region = resolveHomeRegion(homeRegion);
  const promos = useMemo(() => selectPromos(logs, medications, now), [logs, medications, now]);

  return (
    <View style={styles.stack}>
      {promos.map((promo) => {
        switch (promo.kind) {
          case 'walk_in_clinic':
            return <WalkInClinicCard key={promo.kind} promo={promo} region={region} />;
          case 'pharmacy_refill':
            return (
              <RefillCard
                key={promo.kind}
                medications={promo.medications}
                onPress={() => onRequestRefill(promo.medications)}
              />
            );
          case 'primary_care':
            return <PrimaryCareCarousel key={promo.kind} region={region} />;
        }
      })}
    </View>
  );
}

// --- Walk-in clinic --------------------------------------------------------

function WalkInClinicCard({
  promo,
  region,
}: {
  promo: Extract<PromoDecision, { kind: 'walk_in_clinic' }>;
  region: HomeRegion | null;
}) {
  const { log, highPain, matchedKeywords } = promo;
  const loggedOn = parseLocalISODate(log.log_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const reasons = [highPain ? `pain ${log.pain_level}/10` : null, ...matchedKeywords].filter(Boolean).join(', ');

  return (
    <View style={[styles.card, styles.alertCard]}>
      <View style={styles.cardHeader}>
        <IconBadge name="medkit" color={colors.accentStrong} background={colors.accentTint} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.title} accessibilityRole="header">
            High pain levels detected.
          </Text>
          <Text style={styles.message}>Need immediate care? Visit a Samy&apos;s Walk-In Clinic today.</Text>
        </View>
      </View>

      <Text style={styles.meta}>
        Based on your log from {loggedOn}: {reasons}
      </Text>

      <Pressable
        onPress={() => openMapsSearch(walkInClinicQuery(region))}
        accessibilityRole="button"
        accessibilityLabel={`Get directions to the nearest Samy's Walk-In Clinic${region ? ` in ${region}` : ''}`}
        accessibilityHint="Opens your maps app"
        style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
      >
        <Ionicons name="navigate" size={18} color={colors.onAccent} />
        <Text style={styles.primaryButtonText}>
          {region ? `Find a clinic in ${region}` : 'Find the nearest clinic'}
        </Text>
      </Pressable>

      <Text style={styles.disclaimer}>If this is an emergency, call 911.</Text>
    </View>
  );
}

// --- Pharmacy refill -------------------------------------------------------

function formatMedicationNames(medications: Medication[]): string {
  const names = medications.map((med) => med.medication_name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} more`;
}

function RefillCard({ medications, onPress }: { medications: Medication[]; onPress: () => void }) {
  const names = formatMedicationNames(medications);
  const lowest = medications[0];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`You're running low on ${names}. Send a refill request to Samy's Drug Mart.`}
      style={({ pressed }) => [styles.card, styles.refillCard, pressed && styles.pressed]}
    >
      <View style={styles.cardHeader}>
        <IconBadge name="medical" color={colors.primary} background={colors.primaryTint} />
        <View style={styles.cardHeaderText}>
          <Text style={styles.title}>You&apos;re running low on {names}.</Text>
          <Text style={styles.message}>Tap here to send a refill request to Samy&apos;s Drug Mart.</Text>
          <Text style={styles.meta}>
            {lowest.medication_name}: {lowest.current_supply} left
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={colors.textMuted} style={styles.chevron} />
      </View>
    </Pressable>
  );
}

// --- Primary care (default, rotating) --------------------------------------

type Slide = {
  id: string;
  icon: IconName;
  title: string;
  message: string;
  cta: string;
  query: (region: HomeRegion | null) => string;
};

const PRIMARY_CARE_SLIDES: Slide[] = [
  {
    id: 'family-doctors',
    icon: 'people',
    title: 'Looking for a primary care provider?',
    message: 'Our family doctors in Hamilton, Concord, and St. Catharines are accepting new patients.',
    cta: 'Find a family clinic',
    query: familyClinicQuery,
  },
  {
    id: 'walk-in',
    icon: 'medkit',
    title: 'Care when you need it',
    message: "Samy's Walk-In Clinics are here for unexpected health concerns.",
    cta: 'Find a walk-in clinic',
    query: walkInClinicQuery,
  },
  {
    id: 'pharmacy',
    icon: 'storefront',
    title: 'Prescriptions made simple',
    message: "Fill and refill your prescriptions at Samy's Drug Mart.",
    cta: "Find a Samy's Drug Mart",
    query: pharmacyQuery,
  },
];

const ROTATION_INTERVAL_MS = 7000;
const FADE_DURATION_MS = 250;

/**
 * Auto-rotating content must be pausable (WCAG 2.2.2), so rotation is skipped
 * entirely when the user has Reduce Motion or a screen reader enabled.
 */
function useAutoRotateAllowed(): boolean {
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let active = true;
    let reduceMotion = true;
    let screenReader = true;
    const update = () => {
      if (active) setAllowed(!reduceMotion && !screenReader);
    };

    Promise.all([
      AccessibilityInfo.isReduceMotionEnabled(),
      // react-native-web always reports a screen reader, so only trust it on native.
      Platform.OS === 'web' ? Promise.resolve(false) : AccessibilityInfo.isScreenReaderEnabled(),
    ])
      .then(([rm, sr]) => {
        reduceMotion = rm;
        screenReader = sr;
        update();
      })
      .catch(() => {});

    const subscriptions = [
      AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
        reduceMotion = enabled;
        update();
      }),
      AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
        screenReader = enabled;
        update();
      }),
    ];

    return () => {
      active = false;
      subscriptions.forEach((subscription) => subscription.remove());
    };
  }, []);

  return allowed;
}

function PrimaryCareCarousel({ region }: { region: HomeRegion | null }) {
  const [index, setIndex] = useState(0);
  // Grows to the tallest slide seen so rotation doesn't shift the content below.
  const [minHeight, setMinHeight] = useState(0);
  const [opacity] = useState(() => new Animated.Value(1));
  const autoRotate = useAutoRotateAllowed();

  useEffect(() => {
    if (!autoRotate || PRIMARY_CARE_SLIDES.length < 2) return;

    const timer = setInterval(() => {
      Animated.timing(opacity, { toValue: 0, duration: FADE_DURATION_MS, useNativeDriver: true }).start(
        ({ finished }) => {
          if (!finished) return;
          setIndex((current) => (current + 1) % PRIMARY_CARE_SLIDES.length);
          Animated.timing(opacity, { toValue: 1, duration: FADE_DURATION_MS, useNativeDriver: true }).start();
        },
      );
    }, ROTATION_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      opacity.stopAnimation();
      opacity.setValue(1);
    };
  }, [autoRotate, opacity]);

  const slide = PRIMARY_CARE_SLIDES[index];

  return (
    <View style={[styles.card, styles.passiveCard]}>
      <Animated.View
        style={{ opacity, minHeight }}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setMinHeight((current) => Math.max(current, height));
        }}
      >
        <View style={styles.cardHeader}>
          <IconBadge name={slide.icon} color={colors.primary} background={colors.primaryTint} />
          <View style={styles.cardHeaderText}>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.message}>{slide.message}</Text>
          </View>
        </View>

        <Pressable
          onPress={() => openMapsSearch(slide.query(region))}
          accessibilityRole="button"
          accessibilityHint="Opens your maps app"
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
        >
          <Text style={styles.secondaryButtonText}>{slide.cta}</Text>
          <Ionicons name="arrow-forward" size={16} color={colors.primary} />
        </Pressable>
      </Animated.View>

      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {PRIMARY_CARE_SLIDES.map((s, i) => (
          <View key={s.id} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

// --- Shared ----------------------------------------------------------------

function IconBadge({ name, color, background }: { name: IconName; color: string; background: string }) {
  return (
    <View style={[styles.iconBadge, { backgroundColor: background }]}>
      <Ionicons name={name} size={22} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.card,
  },
  alertCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.accent,
  },
  refillCard: {
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    minHeight: MIN_TOUCH_TARGET,
  },
  passiveCard: {
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardHeaderText: {
    flex: 1,
    gap: spacing.xs,
  },
  iconBadge: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.label,
    fontSize: 16,
  },
  message: {
    ...typography.body,
  },
  meta: {
    ...typography.caption,
  },
  disclaimer: {
    ...typography.caption,
    textAlign: 'center',
  },
  chevron: {
    alignSelf: 'center',
  },
  primaryButton: {
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.onAccent,
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    minHeight: MIN_TOUCH_TARGET,
    marginTop: spacing.md,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.primaryTint,
  },
  secondaryButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.85,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.primary,
  },
});
