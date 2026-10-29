import type { ReactNode } from "react";
import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius, spacing, shadows } from "@/theme/tokens";
import { Text } from "./Text";

type Props = {
  title?: string;
  children: ReactNode;
  elevated?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function Card({ title, children, elevated = false, style }: Props) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {title ? <Text variant="heading" style={styles.title}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
  elevated: {
    ...shadows.card,
    borderColor: colors.line,
  },
  title: {
    marginBottom: spacing.md,
  },
});
