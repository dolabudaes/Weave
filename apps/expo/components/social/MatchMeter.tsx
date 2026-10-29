import React from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  label?: string;
  score: number;
};

export function MatchMeter({ label = "Signal strength", score }: Props) {
  const progress = React.useRef(new Animated.Value(0)).current;
  const normalized = Math.max(12, Math.min(98, Math.round(score)));

  React.useEffect(() => {
    Animated.spring(progress, { friction: 8, tension: 90, toValue: normalized, useNativeDriver: false }).start();
  }, [normalized, progress]);

  const width = progress.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text variant="small" subtle>{label}</Text>
        <Text variant="label">{normalized}%</Text>
      </View>
      <View style={styles.track}>
        <Animated.View style={[styles.fill, { width }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  track: {
    overflow: "hidden",
    height: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.soft,
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
  },
});
