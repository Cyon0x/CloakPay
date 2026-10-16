/**
 * The CloakPay design tokens, the same values the web app uses.
 *
 * React Native StyleSheet has no CSS custom properties, so the tokens live here
 * as plain values. They are kept in step with `app/globals.css` by hand, and any
 * change there has to be mirrored here; there is no build step that could do it
 * without pulling a CSS parser into a native app.
 */
export const color = {
  ink950: "#0c0e11",
  ink900: "#14171b",
  ink800: "#1c2026",
  ink700: "#2a2f37",
  slate700: "#4d5763",
  slate600: "#5f6b7a",
  slate500: "#78838f",
  slate400: "#9aa3ae",
  slate300: "#bfc5cd",
  paper0: "#ffffff",
  paper50: "#faf9f7",
  paper100: "#f4f2ef",
  paper200: "#ebe8e3",
  lineSoft: "#e8e4df",
  line: "#dcd7d1",
  lineStrong: "#c8c2ba",
  accent700: "#2b3a4d",
  accent500: "#4c6079",
  accent100: "#e6ebf1",
  ok600: "#1f6b4a",
  ok100: "#e2f0e9",
  warn600: "#8a5a10",
  warn100: "#f7eddc",
  err600: "#9b2f26",
  err100: "#f8e6e3",
  info600: "#2f5d86",
  info100: "#e5eef6",
  shield600: "#3f3a6b",
  shield100: "#eceaf4",
} as const;

export const radius = { xs: 4, sm: 6, md: 10, lg: 14, xl: 20, pill: 999 } as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 22, xxl: 32 } as const;

/** Touch targets are never below this, and it is the floor, not the goal. */
export const TOUCH_TARGET = 44;

export const type = {
  display: { fontSize: 34, fontWeight: "600" as const, letterSpacing: -1.1, lineHeight: 38 },
  title: { fontSize: 24, fontWeight: "600" as const, letterSpacing: -0.6, lineHeight: 30 },
  heading: { fontSize: 17, fontWeight: "600" as const, letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22 },
  small: { fontSize: 13, lineHeight: 19 },
  tiny: { fontSize: 12, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: "600" as const, letterSpacing: 0.9, textTransform: "uppercase" as const },
};

export const shadow = {
  card: {
    shadowColor: "#14171b",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  raised: {
    shadowColor: "#14171b",
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
} as const;

/** Privacy labels carry the same meaning on both platforms. See docs/PRIVACY_PROTOCOL.md. */
export const badgeTone = {
  private: { bg: color.shield100, fg: color.shield600, border: "#dbd7ea" },
  public: { bg: color.paper100, fg: color.slate700, border: color.line },
  pending: { bg: color.warn100, fg: color.warn600, border: "#efe0c6" },
  submitted: { bg: color.warn100, fg: color.warn600, border: "#efe0c6" },
  confirmed: { bg: color.ok100, fg: color.ok600, border: "#cde4d8" },
  failed: { bg: color.err100, fg: color.err600, border: "#efd2ce" },
  expired: { bg: color.err100, fg: color.err600, border: "#efd2ce" },
  setup: { bg: color.info100, fg: color.info600, border: "#d3e1ee" },
} as const;

export const BADGE_LABEL: Record<string, string> = {
  private: "Private",
  public: "By username",
  pending: "Pending",
  submitted: "Submitted",
  confirmed: "Confirmed",
  failed: "Failed",
  expired: "Expired",
  setup: "Privacy setup required",
};
