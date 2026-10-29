import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { personAvatarUrl, personName, simpleRecommendationPitch } from "@/components/social/profileDisplay";
import { colors, radius, spacing } from "@/theme/tokens";
import type { Recommendation } from "@/types/weave";

type Props = {
  rec: Recommendation;
  onPress: () => void;
};

export function AiRecommendCard({ rec, onPress }: Props) {
  const name = personName(rec.candidate);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Avatar imageUrl={personAvatarUrl(rec.candidate)} name={name} size={44} />
      <View style={styles.copy}>
        <Text variant="label">{name}</Text>
        <Text muted numberOfLines={2}>
          {rec.relationship === "one_way" ? "One-way. Waiting on them." : simpleRecommendationPitch(rec)}
        </Text>
      </View>
      <Text variant="small" style={styles.cta}>
        {rec.relationship === "one_way" ? "Waiting" : "Index"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  cta: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.65,
  },
});
