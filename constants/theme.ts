/**
 * Samy design system tokens. Every screen and component pulls from here so the
 * palette, radii and elevation stay consistent across the app.
 */

export const colors = {
  /** Serene Teal: headers, main navigation. */
  primary: '#2B7A78',
  /** Warm Coral: primary buttons, alerts. */
  accent: '#E7717D',
  /** Pearl Gray: main app background. */
  background: '#F7F9FB',
  /** Pure White: cards, inputs. */
  surface: '#FFFFFF',
  /** Deep Slate: all text. */
  text: '#3A506B',

  // Derived from the core palette. Pairings below meet WCAG AA (4.5:1) for body text.
  /** Secondary text (timestamps, captions) on surface or background. */
  textMuted: '#5D6F86',
  /** Coral shade for small text on white or accentTint, where raw coral is too light. */
  accentStrong: '#A83A47',
  primaryTint: '#EEF7F6',
  accentTint: '#FDF0F1',
  border: '#E4E9F0',
  onPrimary: '#FFFFFF',
  onAccent: '#FFFFFF',
} as const;

export const radius = {
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Minimum accessible touch target (Apple HIG / Material). */
export const MIN_TOUCH_TARGET = 44;

export const typography = {
  // System sans-serif (SF Pro / Roboto); swap in Inter via expo-font if desired.
  title: { fontSize: 24, fontWeight: '700', color: colors.text },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text, lineHeight: 21 },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
} as const;

/** Subtle elevation. RN's New Architecture renders boxShadow natively on iOS and Android. */
export const shadow = {
  card: { boxShadow: '0px 4px 12px rgba(58, 80, 107, 0.08)' },
  raised: { boxShadow: '0px 6px 18px rgba(58, 80, 107, 0.14)' },
} as const;
