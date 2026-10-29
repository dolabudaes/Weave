import React from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AskWeiButton } from "@/components/social/AskWeiButton";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, radius, spacing } from "@/theme/tokens";
import type { Recommendation } from "@/types/weave";
import {
  matchedTagsFromRecommendation,
  personAvatarUrl,
  personName,
  recommendationTeaser,
  sharedSignalLine,
  tagsFromRecommendation,
} from "./profileDisplay";

type Props = {
  rec: Recommendation;
  onOpen: () => void;
  onDecide: (decision: "not_relevant" | "interested") => void;
  onAskWei?: () => void;
  onSave?: () => void;
  saved?: boolean;
  style?: ViewStyle;
};

export function RecommendationCard({ rec, onOpen, onDecide, onAskWei, onSave, saved = false, style }: Props) {
  const { isCompact } = useResponsive();
  const avatarSize = isCompact ? 64 : 72;
  const name = personName(rec.candidate);
  const tags = matchedTagsFromRecommendation(rec, 4).length ? matchedTagsFromRecommendation(rec, 4) : tagsFromRecommendation(rec, 3);
  const teaser = recommendationTeaser(rec);
  const signal = sharedSignalLine(rec);

  return (
    <View style={[styles.card, style]}>
      <Pressable onPress={onOpen} style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <Avatar name={name} imageUrl={personAvatarUrl(rec.candidate)} ring size={avatarSize} />
        <View style={styles.identity}>
          <Text variant="heading">{name}</Text>
          <Text muted numberOfLines={2}>
            {teaser}
          </Text>
        </View>
        {onAskWei ? (
          <AskWeiButton compact onPress={onAskWei} />
        ) : onSave ? (
          <Pressable accessibilityLabel="Save" onPress={onSave} style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
            <Ionicons color={colors.ink} name={saved ? "bookmark" : "bookmark-outline"} size={22} />
          </Pressable>
        ) : null}
      </Pressable>

      {tags.length ? (
        <Text variant="small" muted style={styles.tags}>
          {tags.join(" · ")}
        </Text>
      ) : null}

      <Text variant="body" numberOfLines={3} style={styles.reason}>
        {signal}
      </Text>

      {rec.relationship === "one_way" ? (
        <Text variant="small" style={styles.waiting}>
          One-way. Waiting on them.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button onPress={() => onDecide("not_relevant")} style={styles.action}>
          Not interested
        </Button>
        {rec.relationship === "one_way" ? (
          <Button style={styles.action} variant="primary">
            Waiting
          </Button>
        ) : (
          <Button onPress={() => onDecide("interested")} variant="primary" style={styles.action}>
            Interested
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  iconBtn: {
    padding: spacing.xs,
  },
  tags: {
    letterSpacing: 0.2,
  },
  reason: {
    lineHeight: 20,
  },
  waiting: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  action: {
    flex: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
