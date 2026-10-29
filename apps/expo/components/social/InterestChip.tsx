import { Pressable, StyleSheet, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  label: string;
  tone?: "stable" | "recent" | "soft";
  onPress?: () => void;
  style?: ViewStyle;
};

export function InterestChip({ label, tone = "soft", onPress, style }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, styles[tone], pressed && styles.pressed, style]}>
      <Text variant="small" style={tone === "recent" ? styles.recentText : styles.text}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
  },
  stable: {
    backgroundColor: colors.soft,
  },
  recent: {
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accentMuted,
  },
  soft: {
    backgroundColor: colors.soft,
  },
  text: {
    color: colors.muted,
  },
  recentText: {
    color: colors.accent,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
});
