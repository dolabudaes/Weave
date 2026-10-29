import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, spacing } from "@/theme/tokens";
import { Text } from "./Text";

type Props = {
  children: ReactNode;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "link";
  style?: ViewStyle | ViewStyle[];
};

export function Button({ children, onPress, variant = "secondary", style }: Props) {
  const primary = variant === "primary";
  const ghost = variant === "ghost";
  const link = variant === "link";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        ghost && styles.ghost,
        link && styles.link,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.content}>
        <Text variant="label" style={primary ? styles.primaryText : link ? styles.linkText : undefined} muted={!primary && !ghost && !link}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
  },
  primary: {
    backgroundColor: colors.accent,
  },
  ghost: {
    backgroundColor: "transparent",
  },
  link: {
    minHeight: 32,
    backgroundColor: "transparent",
    paddingHorizontal: spacing.sm,
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 0,
  },
  primaryText: {
    color: colors.onAccent,
    fontWeight: "700",
  },
  linkText: {
    color: colors.accent,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.65,
  },
});
