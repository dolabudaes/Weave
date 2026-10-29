import type { ReactNode } from "react";
import { Text as RNText, StyleSheet, type TextStyle } from "react-native";
import { colors, fonts, typography } from "@/theme/tokens";

type Props = {
  children: ReactNode;
  variant?: "hero" | "title" | "heading" | "body" | "small" | "label";
  muted?: boolean;
  subtle?: boolean;
  numberOfLines?: number;
  style?: TextStyle | TextStyle[];
};

export function Text({ children, variant = "body", muted = false, subtle = false, numberOfLines, style }: Props) {
  return (
    <RNText numberOfLines={numberOfLines} style={[styles.base, styles[variant], muted && styles.muted, subtle && styles.subtle, style]}>
      {children}
    </RNText>
  );
}

const styles = StyleSheet.create({
  base: {
    color: colors.ink,
    fontFamily: fonts.sans,
    letterSpacing: 0.1,
  },
  hero: {
    fontSize: typography.hero,
    fontWeight: "600",
    lineHeight: 32,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: typography.title,
    fontWeight: "600",
    lineHeight: 28,
    letterSpacing: -0.2,
  },
  heading: {
    fontSize: typography.heading,
    fontWeight: "600",
    lineHeight: 22,
  },
  body: {
    fontSize: typography.body,
    lineHeight: 20,
  },
  small: {
    fontSize: typography.small,
    lineHeight: 16,
  },
  label: {
    fontSize: typography.label,
    fontWeight: "600",
    lineHeight: 18,
  },
  muted: {
    color: colors.muted,
  },
  subtle: {
    color: colors.subtle,
  },
});
