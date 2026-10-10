import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PromoBanner from '@/components/PromoBanner';
import { colors, MIN_TOUCH_TARGET, radius, shadow, spacing, typography } from '@/constants/theme';
import {
  parseLocalISODate,
  resolveHomeRegion,
  toLocalISODate,
  type Medication,
  type SymptomLog,
  type UserProfile,
} from '@/services/supabase';

// ---------------------------------------------------------------------------
// Mock data (replaced by fetchUserProfile / fetchRecentSymptomLogs /
// fetchActiveMedications once auth is in place)
// ---------------------------------------------------------------------------

const MOCK_USER_ID = '00000000-0000-4000-8000-000000000001';

function daysAgo(days: number): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days));
}

const MOCK_USER: UserProfile = {
  user_id: MOCK_USER_ID,
  first_name: 'Alex',
  email: 'alex@example.com',
  date_of_birth: '1988-04-12',
  home_region: 'Hamilton',
  created_at: null,
};

const MOCK_MEDICATIONS: Medication[] = [
  {
    med_id: 'mock-med-1',
    user_id: MOCK_USER_ID,
    medication_name: 'Metformin',
    dosage: '500 mg',
    frequency: 'Twice daily',
    current_supply: 5,
    refill_threshold: 7,
    is_active: true,
  },
  {
    med_id: 'mock-med-2',
    user_id: MOCK_USER_ID,
    medication_name: 'Vitamin D3',
    dosage: '1000 IU',
    frequency: 'Once daily',
    current_supply: 48,
    refill_threshold: 7,
    is_active: true,
  },
];

const MOCK_LOGS: SymptomLog[] = [
  {
    log_id: 'mock-log-1',
    user_id: MOCK_USER_ID,
    log_date: daysAgo(0),
    pain_level: 8,
    mood_score: 2,
    raw_input: 'Woke up with a pounding migraine behind my left eye. Sensitive to light and skipped breakfast.',
    extracted_tags: ['migraine', 'light sensitivity', 'nausea'],
  },
  {
    log_id: 'mock-log-2',
    user_id: MOCK_USER_ID,
    log_date: daysAgo(1),
    pain_level: 4,
    mood_score: 3,
    raw_input: 'Mild headache in the afternoon. Better after resting and drinking water.',
    extracted_tags: ['headache', 'fatigue'],
  },
  {
    log_id: 'mock-log-3',
    user_id: MOCK_USER_ID,
    log_date: daysAgo(2),
    pain_level: 3,
    mood_score: 4,
    raw_input: 'Good day overall. Some lower back stiffness in the morning that eased by lunch.',
    extracted_tags: ['back stiffness'],
  },
  {
    log_id: 'mock-log-4',
    user_id: MOCK_USER_ID,
    log_date: daysAgo(4),
    pain_level: 6,
    mood_score: 3,
    raw_input: 'Aching in both knees after a long walk. Took all medications on time.',
    extracted_tags: ['joint pain', 'knees'],
  },
  {
    log_id: 'mock-log-5',
    user_id: MOCK_USER_ID,
    log_date: daysAgo(6),
    pain_level: 2,
    mood_score: 5,
    raw_input: 'Slept eight hours and felt great.',
    extracted_tags: [],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOOD_LABELS: Record<number, string> = { 1: 'Very low', 2: 'Low', 3: 'Okay', 4: 'Good', 5: 'Great' };

function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatLogDate(logDate: string): string {
  if (logDate === daysAgo(0)) return 'Today';
  if (logDate === daysAgo(1)) return 'Yesterday';
  return parseLocalISODate(logDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function painTone(level: number) {
  if (level >= 7) return { background: colors.accentTint, foreground: colors.accentStrong };
  if (level >= 4) return { background: colors.border, foreground: colors.text };
  return { background: colors.primaryTint, foreground: colors.primary };
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

function summarizeLastSevenDays(logs: SymptomLog[]) {
  const earliest = daysAgo(6);
  const week = logs.filter((log) => log.log_date >= earliest);
  return {
    avgPain: average(week.flatMap((log) => (log.pain_level != null ? [log.pain_level] : []))),
    avgMood: average(week.flatMap((log) => (log.mood_score != null ? [log.mood_score] : []))),
    daysLogged: new Set(week.map((log) => log.log_date)).size,
  };
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const user = MOCK_USER;
  const logs = MOCK_LOGS;
  const medications = MOCK_MEDICATIONS;

  const region = resolveHomeRegion(user.home_region);
  const today = new Date();
  const summary = useMemo(() => summarizeLastSevenDays(logs), [logs]);

  const openLogModal = useCallback(() => {
    // Opens <LogModal /> (components/LogModal.tsx), added in the next step.
  }, []);

  const requestRefill = useCallback((_lowSupply: Medication[]) => {
    // Sends the refill request to Samy's Drug Mart; wired up with the Medications tab.
  }, []);

  const listHeader = (
    <View style={styles.listHeader}>
      <PromoBanner
        logs={logs}
        medications={medications}
        homeRegion={user.home_region}
        onRequestRefill={requestRefill}
      />

      <Pressable
        onPress={openLogModal}
        accessibilityRole="button"
        accessibilityLabel="Log today's symptoms"
        style={({ pressed }) => [styles.logButton, pressed && styles.pressed]}
      >
        <Ionicons name="add-circle" size={24} color={colors.onAccent} />
        <Text style={styles.logButtonText}>Log today&apos;s symptoms</Text>
      </Pressable>

      <View style={styles.statsRow}>
        <StatTile label="Avg pain" value={summary.avgPain?.toFixed(1) ?? '–'} suffix="/10" />
        <StatTile label="Avg mood" value={summary.avgMood?.toFixed(1) ?? '–'} suffix="/5" />
        <StatTile label="Days logged" value={String(summary.daysLogged)} suffix="/7" />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Recent logs
      </Text>
    </View>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greetingFor(today)},</Text>
          <Text style={styles.name} accessibilityRole="header">
            {user.first_name}
          </Text>
          <Text style={styles.date}>
            {today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </Text>
        </View>
        {region && (
          <View style={styles.regionChip} accessibilityLabel={`Home region: ${region}`}>
            <Ionicons name="location" size={14} color={colors.onPrimary} />
            <Text style={styles.regionText}>{region}</Text>
          </View>
        )}
      </View>

      <FlatList
        data={logs}
        keyExtractor={(log) => log.log_id}
        renderItem={({ item }) => <LogCard log={item} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={<EmptyLogs />}
        ItemSeparatorComponent={Separator}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

function StatTile({ label, value, suffix }: { label: string; value: string; suffix: string }) {
  return (
    <View style={styles.statTile} accessible accessibilityLabel={`${label}: ${value}${suffix}`}>
      <Text style={styles.statValue}>
        {value}
        <Text style={styles.statSuffix}>{suffix}</Text>
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LogCard({ log }: { log: SymptomLog }) {
  const dateLabel = formatLogDate(log.log_date);
  const tone = log.pain_level != null ? painTone(log.pain_level) : null;
  const moodLabel = log.mood_score != null ? MOOD_LABELS[log.mood_score] : null;
  const tags = Array.isArray(log.extracted_tags) ? log.extracted_tags : [];

  const a11yLabel = [
    dateLabel,
    log.pain_level != null && `pain ${log.pain_level} out of 10`,
    moodLabel && `mood ${moodLabel}`,
    log.raw_input,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <View style={styles.logCard} accessible accessibilityLabel={a11yLabel}>
      <View style={styles.logCardHeader}>
        <Text style={styles.logDate}>{dateLabel}</Text>
        {tone && (
          <View style={[styles.painBadge, { backgroundColor: tone.background }]}>
            <Text style={[styles.painBadgeText, { color: tone.foreground }]}>Pain {log.pain_level}/10</Text>
          </View>
        )}
      </View>

      {moodLabel && (
        <View style={styles.moodRow}>
          <Ionicons
            name={log.mood_score != null && log.mood_score <= 2 ? 'sad-outline' : 'happy-outline'}
            size={16}
            color={colors.textMuted}
          />
          <Text style={styles.moodText}>
            Mood: {moodLabel} ({log.mood_score}/5)
          </Text>
        </View>
      )}

      {log.raw_input ? (
        <Text style={styles.logBody} numberOfLines={3}>
          {log.raw_input}
        </Text>
      ) : null}

      {tags.length > 0 && (
        <View style={styles.tagRow}>
          {tags.map((tag, i) => (
            <View key={`${tag}-${i}`} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

function EmptyLogs() {
  return (
    <View style={styles.empty}>
      <Ionicons name="document-text-outline" size={32} color={colors.textMuted} />
      <Text style={styles.emptyTitle}>No logs yet</Text>
      <Text style={styles.emptyBody}>Your daily entries will appear here and feed your doctor report.</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    ...shadow.raised,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: '500',
    opacity: 0.9,
  },
  name: {
    ...typography.title,
    color: colors.onPrimary,
    fontSize: 28,
  },
  date: {
    color: colors.onPrimary,
    fontSize: 14,
    marginTop: spacing.xs,
    opacity: 0.9,
  },
  regionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  regionText: {
    color: colors.onPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    gap: spacing.lg,
    marginBottom: spacing.md,
  },
  logButton: {
    minHeight: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    ...shadow.raised,
  },
  logButtonText: {
    color: colors.onAccent,
    fontSize: 17,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.99 }],
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  statTile: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: MIN_TOUCH_TARGET,
    ...shadow.card,
  },
  statValue: {
    ...typography.heading,
    fontSize: 22,
  },
  statSuffix: {
    ...typography.caption,
  },
  statLabel: {
    ...typography.caption,
    marginTop: 2,
  },
  sectionTitle: {
    ...typography.heading,
    marginTop: spacing.sm,
  },
  separator: {
    height: spacing.md,
  },
  logCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    ...shadow.card,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logDate: {
    ...typography.label,
  },
  painBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  painBadgeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  moodText: {
    ...typography.caption,
  },
  logBody: {
    ...typography.body,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  tagText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  empty: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.xxl,
  },
  emptyTitle: {
    ...typography.heading,
  },
  emptyBody: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
