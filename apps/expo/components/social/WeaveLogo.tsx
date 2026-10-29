import { StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, spacing } from "@/theme/tokens";
import { WeaveMark } from "./WeaveMark";

type Props = {
  size?: "small" | "regular" | "large";
  showMark?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function WeaveLogo({ size = "regular", showMark = true, style }: Props) {
  return (
    <View style={[styles.logo, style]}>
      {showMark ? <WeaveMark size={size === "small" ? 24 : size === "large" ? 40 : 28} /> : null}
      <Text variant={size === "large" ? "title" : "heading"} style={styles.wordmark}>
        weave
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.ink,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "lowercase",
  },
});
