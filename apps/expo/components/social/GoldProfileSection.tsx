import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import type { GoldInterest, GoldProfile, GoldProfileDomain, SocialPost } from "@/types/weave";
import { DOMAIN_LABELS, cleanTag, findEvidencePosts, normalizeDomains, postDate, postTextSummary, sentence } from "./profileDisplay";
import { InterestChip } from "./InterestChip";

type Props = {
  profile?: GoldProfile | null;
  posts: SocialPost[];
};

export type GoldProfileSelection = {
  interest: GoldInterest;
  label: string;
};

type InterestGroup = {
  key: string;
  interests: GoldInterest[];
  label?: string;
  tone: "stable" | "recent" | "soft";
};

export function GoldProfileSection({ profile, posts, onSelect }: Props & { onSelect: (value: GoldProfileSelection) => void }) {
  const domains = React.useMemo(() => normalizeDomains(profile), [profile]);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text variant="heading">Life index</Text>
        <Text muted variant="small">
          From recent posts
        </Text>
      </View>
      <View style={styles.domainList}>
        {domains.map((domain) => (
          <GoldDomain key={domain.domain} domain={domain} onSelect={onSelect} />
        ))}
      </View>
    </View>
  );
}

export function GoldProfileEvidenceSheet({
  selected,
  posts,
  onClose,
}: {
  selected: GoldProfileSelection | null;
  posts: SocialPost[];
  onClose: () => void;
}) {
  return <EvidenceSheet onClose={onClose} posts={posts} selected={selected} />;
}

function GoldDomain({ domain, onSelect }: { domain: GoldProfileDomain; onSelect: (interest: GoldProfileSelection) => void }) {
  const stable = domain.long_term_interests || [];
  const recent = domain.short_term_interests || [];
  const negative = domain.negative_interests || [];
  const groups = interestGroups(stable, recent, negative);
  const inactive = !stable.length && !recent.length;

  return (
    <View style={[styles.domain, inactive && styles.inactiveDomain]}>
      <View style={styles.domainTop}>
        <Text variant="label">{DOMAIN_LABELS[domain.domain] || domain.domain}</Text>
        <Text variant="small" subtle>{domainHint(stable, recent, negative)}</Text>
      </View>
      {groups.length ? (
        groups.map((group) => (
          <InterestBucket
            domainKey={domain.domain}
            group={group}
            key={`${domain.domain}-${group.key}`}
            onSelect={onSelect}
          />
        ))
      ) : (
        <Text muted>No clear social signal here yet.</Text>
      )}
    </View>
  );
}

function InterestBucket({
  domainKey,
  group,
  onSelect,
}: {
  domainKey: string;
  group: InterestGroup;
  onSelect: (interest: GoldProfileSelection) => void;
}) {
  return (
    <View style={styles.bucket}>
      {group.label ? <Text variant="small" subtle>{group.label}</Text> : null}
      <View style={styles.chips}>
        {group.interests.map((interest, index) => {
          const chipLabel = cleanTag(interest.label);
          if (!chipLabel) return null;
          const evidenceKey = interest.evidence_post_ids?.join("-") || String(index);
          return (
            <InterestChip
              key={`${domainKey}-${group.key}-${evidenceKey}-${chipLabel}`}
              label={chipLabel}
              onPress={() => onSelect({ interest, label: chipLabel })}
              tone={group.tone}
            />
          );
        })}
      </View>
    </View>
  );
}

function interestGroups(stable: GoldInterest[], recent: GoldInterest[], negative: GoldInterest[]): InterestGroup[] {
  if (stable.length && recent.length) {
    return [
      { key: "stable", label: "Steady interests", interests: stable, tone: "stable" },
      { key: "recent", label: "Recent focus", interests: recent, tone: "recent" },
    ];
  }
  if (recent.length) {
    return [{ key: "recent", label: "Recent focus", interests: recent, tone: "recent" }];
  }
  if (stable.length) {
    return [{ key: "stable", label: "Steady interests", interests: stable, tone: "stable" }];
  }
  if (negative.length) {
    return [{ key: "negative", label: "Not the best opener", interests: negative, tone: "soft" }];
  }
  return [];
}

function domainHint(stable: GoldInterest[], recent: GoldInterest[], negative: GoldInterest[]) {
  if (stable.length && recent.length) return "A mix of steady and recent signals";
  if (recent.length) return "Showing up in recent posts";
  if (stable.length) return "A stable interest";
  if (negative.length) return "Better not to open here";
  return "No clear signal yet";
}

function EvidenceSheet({ selected, posts, onClose }: { selected: GoldProfileSelection | null; posts: SocialPost[]; onClose: () => void }) {
  const evidencePosts = selected ? findEvidencePosts(selected.interest, posts) : [];

  return (
    <BottomSheet onClose={onClose} scrollable visible={Boolean(selected)}>
      <View style={styles.sheetTop}>
        <View style={styles.sheetTitle}>
          <Text variant="heading">About {selected?.label}</Text>
          <Text variant="small" subtle>
            Life index
          </Text>
        </View>
        <Pressable onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Ionicons color={colors.ink} name="close" size={20} />
        </Pressable>
      </View>
      {evidencePosts.length ? (
        <View style={styles.evidenceList}>
          <Text>This signal comes from these past posts.</Text>
          {evidencePosts.map((post, index) => (
            <View key={post.id ?? `${post.original_url}-${index}`} style={styles.evidencePost}>
              <Text variant="small" subtle>
                {postDate(post)}
              </Text>
              <Text>{sentence(postTextSummary(post))}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.verifiedOnly}>
          <Ionicons color={colors.muted} name="shield-checkmark-outline" size={22} />
          <Text>This is a confirmed social signal.</Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  domainList: {
    gap: spacing.sm,
  },
  domain: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingVertical: spacing.md,
  },
  inactiveDomain: {
    opacity: 0.72,
  },
  domainTop: {
    gap: 3,
  },
  bucket: {
    gap: spacing.sm,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  sheetTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  sheetTitle: {
    flex: 1,
    gap: 2,
  },
  closeButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.soft,
  },
  pressed: {
    opacity: 0.72,
  },
  evidenceList: {
    gap: spacing.md,
  },
  evidencePost: {
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  verifiedOnly: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.soft,
    padding: spacing.lg,
  },
});
