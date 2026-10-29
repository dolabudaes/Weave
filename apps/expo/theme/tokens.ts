import { Platform } from "react-native";

/** Product palette: white canvas, black type, green accent only */
export const colors = {
  bg: "#FFFFFF",
  canvas: "#FAFAFA",
  surface: "#F5F5F5",
  surfaceRaised: "#FFFFFF",
  card: "#FFFFFF",
  ink: "#0A0A0A",
  muted: "#525252",
  subtle: "#A3A3A3",
  line: "#E5E5E5",
  lineStrong: "#D4D4D4",
  accent: "#3DDC84",
  accentBright: "#2BC770",
  accentSoft: "rgba(61, 220, 132, 0.14)",
  accentMuted: "#1F8F55",
  lime: "#3DDC84",
  limeSoft: "rgba(61, 220, 132, 0.12)",
  rose: "#0A0A0A",
  roseSoft: "#FAFAFA",
  peach: "#525252",
  peachSoft: "#FAFAFA",
  sky: "#525252",
  skySoft: "#FAFAFA",
  iris: "#A3A3A3",
  irisSoft: "#FAFAFA",
  success: "#1F8F55",
  dangerBg: "#FEF2F2",
  warning: "#DC2626",
  soft: "#F5F5F5",
  overlay: "rgba(0,0,0,0.4)",
  bubbleUser: "#007AFF",
  bubbleFriend: "#E9E9EB",
  onBubble: "#FFFFFF",
  chatCanvas: "#FFFFFF",
  imessageBlue: "#007AFF",
  storyRing: "#3DDC84",
  storyRingAlt: "#1F8F55",
  onAccent: "#0A0A0A",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  page: 16,
  xl: 20,
  xxl: 28,
};

export const layout = {
  screenMax: 480,
  railMax: 935,
  tabBarHeight: Platform.OS === "web" ? 50 : 56,
  sidebarWidth: 244,
};

export const fonts = {
  sans: Platform.select({
    android: "Noto Sans SC",
    ios: "PingFang SC",
    web: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', sans-serif",
    default: undefined,
  }),
  display: Platform.select({
    web: "Georgia, 'Times New Roman', 'Songti SC', serif",
    ios: "Georgia",
    default: undefined,
  }),
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
};

export const typography = {
  hero: 26,
  title: 22,
  heading: 16,
  body: 14,
  small: 12,
  label: 13,
};

export const shadows = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
  soft: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
};

export const animations = {
  quick: 160,
  base: 220,
  page: 280,
  connection: 480,
};
