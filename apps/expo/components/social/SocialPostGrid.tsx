import React, { type ReactNode } from "react";
import { Animated, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { usePageLayout } from "@/theme/pageStyles";
import { colors, radius, spacing } from "@/theme/tokens";
import type { SocialPost } from "@/types/weave";
import { displayImageCaption, displayPostText, postDate, postKey } from "./profileDisplay";

type Props = {
  posts: SocialPost[];
  authorDetail?: string;
  authorName?: string;
  compact?: boolean;
};

type FeedProps = Props & {
  header?: ReactNode;
  footer?: ReactNode;
  scrollEnabled?: boolean;
};

const animatedPostKeys = new Set<string>();

export function SocialPostGrid(props: Props) {
  return <SocialPostFeed {...props} scrollEnabled={false} />;
}

export function SocialPostFeed({ posts, authorName = "User", compact = false, header, footer, scrollEnabled = true }: FeedProps) {
  const page = usePageLayout();
  const [sortOrder, setSortOrder] = React.useState<"latest" | "earliest">("latest");
  const visible = React.useMemo(() => {
    const data = compact ? posts.slice(0, 3) : posts;
    return [...data].sort((a, b) => {
      const left = new Date(a.posted_at || "").getTime() || 0;
      const right = new Date(b.posted_at || "").getTime() || 0;
      return sortOrder === "latest" ? right - left : left - right;
    });
  }, [compact, posts, sortOrder]);

  const listHeader = (
    <>
      {header}
      <View style={styles.feedTop}>
        <View>
          <Text variant="heading">Posts</Text>
          <Text variant="small" subtle>{posts.length} in view</Text>
        </View>
        <View style={styles.sortTabs}>
          <SortTab active={sortOrder === "latest"} label="Latest" onPress={() => setSortOrder("latest")} />
          <SortTab active={sortOrder === "earliest"} label="Earliest" onPress={() => setSortOrder("earliest")} />
        </View>
      </View>
    </>
  );

  if (!visible.length) {
    return (
      <View style={[page.tabPadding, styles.feed]}>
        {listHeader}
        <View style={styles.empty}>
          <Ionicons color={colors.subtle} name="document-text-outline" size={24} />
          <Text muted>No posts in view yet.</Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      ListHeaderComponent={listHeader}
      ListFooterComponent={footer ? <>{footer}</> : null}
      contentContainerStyle={[page.tabPadding, styles.listContent]}
      data={visible}
      keyExtractor={(post, index) => postKey(post, index)}
      renderItem={({ item, index }) => <SocialPostItem authorName={authorName} index={index} itemKey={postKey(item, index)} post={item} />}
      scrollEnabled={scrollEnabled}
      showsVerticalScrollIndicator={false}
      style={page.scroll}
    />
  );
}

function SortTab({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.sortTab, active && styles.sortTabActive, pressed && styles.pressed]}>
      <Text variant="small" style={active ? styles.sortTextActive : undefined} muted={!active}>
        {label}
      </Text>
    </Pressable>
  );
}

function SocialPostItem({ post, authorName, index, itemKey }: { post: SocialPost; authorName: string; index: number; itemKey: string }) {
  const alreadyAnimated = animatedPostKeys.has(itemKey);
  const opacity = React.useRef(new Animated.Value(alreadyAnimated ? 1 : 0)).current;
  const translateY = React.useRef(new Animated.Value(alreadyAnimated ? 0 : 8)).current;

  React.useEffect(() => {
    if (animatedPostKeys.has(itemKey)) return;
    animatedPostKeys.add(itemKey);
    Animated.parallel([
      Animated.timing(opacity, { duration: 200, toValue: 1, useNativeDriver: true }),
      Animated.timing(translateY, { duration: 200, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [itemKey, opacity, translateY]);

  const text = displayPostText(post);
  const caption = displayImageCaption(post);

  return (
    <Animated.View style={[styles.post, { opacity, transform: [{ translateY }] }]}>
      <View style={styles.postHeader}>
        <Avatar name={authorName} size={34} />
        <View style={styles.postMeta}>
          <Text variant="label">{authorName}</Text>
          <Text variant="small" subtle>{postDate(post)}</Text>
        </View>
        <Text variant="small" subtle>{String(index + 1).padStart(2, "0")}</Text>
      </View>
      {text ? <Text style={styles.postBody}>{text}</Text> : null}
      {caption ? <Text variant="small" muted style={styles.caption}>[{caption}]</Text> : null}
      {!text && !caption ? <Text muted>Shared a small everyday fragment.</Text> : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  feed: {
    gap: spacing.md,
    paddingTop: spacing.lg,
  },
  listContent: {
    gap: spacing.md,
  },
  feedTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  sortTabs: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 3,
  },
  sortTab: {
    minWidth: 46,
    alignItems: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  sortTabActive: {
    backgroundColor: colors.card,
  },
  sortTextActive: {
    color: colors.ink,
    fontWeight: "600",
  },
  empty: {
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  post: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
    paddingVertical: spacing.lg,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  postMeta: {
    flex: 1,
    gap: 1,
  },
  postBody: {
    fontSize: 16,
    lineHeight: 24,
  },
  caption: {
    color: colors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
});
