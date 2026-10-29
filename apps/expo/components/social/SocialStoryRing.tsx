import React from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  detail: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  tone?: "rose" | "peach" | "sky" | "iris" | "lime";
};

const toneMap = {
  iris: { bg: colors.soft, border: colors.line },
  lime: { bg: colors.card, border: colors.lineStrong },
  peach: { bg: colors.soft, border: colors.line },
  rose: { bg: colors.card, border: colors.lineStrong },
  sky: { bg: colors.soft, border: colors.line },
};

export function SocialStoryRing({ detail, icon, label, onPress, tone = "rose" }: Props) {
  const scale = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { duration: 1300, toValue: 1.04, useNativeDriver: true }),
        Animated.timing(scale, { duration: 1300, toValue: 1, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale]);

  const palette = toneMap[tone];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && styles.pressed]}>
      <Animated.View style={[styles.ring, { borderColor: palette.border, transform: [{ scale }] }]}>
        <View style={[styles.inner, { backgroundColor: palette.bg }]}>
          <Ionicons color={colors.ink} name={icon} size={22} />
        </View>
      </Animated.View>
      <Text variant="small" style={styles.label}>{label}</Text>
      <Text variant="small" subtle style={styles.detail}>{detail}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: {
    alignItems: "center",
    width: 78,
    gap: spacing.xs,
  },
  ring: {
    alignItems: "center",
    justifyContent: "center",
    width: 62,
    height: 62,
    borderWidth: 2,
    borderRadius: 31,
    backgroundColor: colors.card,
  },
  inner: {
    alignItems: "center",
    justifyContent: "center",
    width: 52,
    height: 52,
    borderRadius: radius.pill,
  },
  label: {
    fontWeight: "600",
    textAlign: "center",
  },
  detail: {
    textAlign: "center",
  },
  pressed: {
    opacity: 0.72,
  },
});
