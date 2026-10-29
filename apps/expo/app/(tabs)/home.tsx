import React from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { RecommendationCarousel } from "@/components/social/RecommendationCarousel";
import { WeiIntroSheet } from "@/components/social/WeiIntroSheet";
import { displayIntentLine, personAvatarUrl, personName } from "@/components/social/profileDisplay";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { colors, spacing } from "@/theme/tokens";
import type { Connection, ConnectionIntent, Recommendation } from "@/types/weave";

async function loadMatchFeed(api: ReturnType<typeof useSession>["api"]) {
  const [intents, connections] = await Promise.all([
    api.request<ConnectionIntent[]>("/intents").catch(() => [] as ConnectionIntent[]),
    api.request<Connection[]>("/connections").catch(() => [] as Connection[]),
  ]);
  const active = intents.find((item) => item.status === "active");
  let recommendations: Recommendation[] = [];
  let waiting: Recommendation[] = [];

  if (active) {
    [recommendations, waiting] = await Promise.all([
      api.request<Recommendation[]>("/recommendations").catch(() => []),
      api.request<Recommendation[]>("/recommendations/waiting").catch(() => []),
    ]);
    if (!recommendations.length) {
      try {
        await api.request<{ items: Recommendation[]; empty_message: string | null }>("/recommendations/generate", {
          method: "POST",
        });
        recommendations = await api.request<Recommendation[]>("/recommendations").catch(() => []);
      } catch {
        recommendations = [];
      }
    }
  }

  return { intents, connections, active, recommendations, waiting };
}

export default function HomeScreen() {
  const { api, user } = useSession();
  const router = useRouter();
  const [intents, setIntents] = React.useState<ConnectionIntent[]>([]);
  const [recommendations, setRecommendations] = React.useState<Recommendation[]>([]);
  const [waiting, setWaiting] = React.useState<Recommendation[]>([]);
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [message, setMessage] = React.useState("");
  const [emptyHint, setEmptyHint] = React.useState<string | null>(null);
  const [savedIds, setSavedIds] = React.useState<number[]>([]);
  const [weiRec, setWeiRec] = React.useState<Recommendation | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setEmptyHint(null);
    try {
      const data = await loadMatchFeed(api);
      setIntents(data.intents);
      setRecommendations(data.recommendations);
      setWaiting(data.waiting);
      setConnections(data.connections);
      if (data.active && !data.recommendations.length) {
        setEmptyHint("No mutual match yet. Sharpen the ask with Noa.");
      }
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  const active = intents.find((item) => item.status === "active");
  const displayName = personName(user ?? undefined);
  const matchEnabled = Boolean(active);
  const linkedCandidateIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const connection of connections) {
      if (connection.status === "closed") continue;
      if (connection.other_user?.id) ids.add(connection.other_user.id);
    }
    return ids;
  }, [connections]);
  const browseItems = React.useMemo(
    () =>
      recommendations.filter(
        (rec) =>
          rec.relationship !== "one_way" &&
          rec.relationship !== "connected" &&
          !linkedCandidateIds.has(rec.candidate?.id) &&
          (rec.status === "new" || rec.status === "active" || !rec.status),
      ),
    [linkedCandidateIds, recommendations],
  );

  const decide = async (rec: Recommendation, decision: "not_relevant" | "interested") => {
    setMessage("");
    try {
      const data = await api.request<{ recommendation: Recommendation; connection?: unknown }>(`/recommendations/${rec.id}/decision`, {
        body: JSON.stringify({ decision }),
        method: "POST",
      });
      setRecommendations((current) => current.filter((item) => item.id !== rec.id));
      if (data.connection) {
        setMessage("It's mutual. Open Messages.");
      } else if (data.recommendation.relationship === "one_way") {
        setWaiting((current) => [data.recommendation, ...current.filter((item) => item.id !== data.recommendation.id)]);
        setMessage("One-way for now. The thread opens if they lean in too.");
      } else {
        setMessage("Passed.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save that");
    }
  };

  const toggleSave = (rec: Recommendation) => {
    setSavedIds((current) => (current.includes(rec.id) ? current.filter((id) => id !== rec.id) : [...current, rec.id]));
  };

  return (
    <View style={styles.page}>
    <ScreenFrame contentStyle={styles.content}>
        <View style={styles.topBar}>
          <Text variant="heading">Home</Text>
          <Pressable onPress={() => router.push("/profile")} style={({ pressed }) => pressed && styles.pressed}>
            <Avatar name={displayName} imageUrl={personAvatarUrl(user ?? undefined)} size={32} />
          </Pressable>
        </View>

        <Pressable onPress={() => router.push("/ai")} style={({ pressed }) => [styles.intentRow, pressed && styles.pressed]}>
          <Text variant="small" subtle>
            Now
          </Text>
          <Text variant="heading" numberOfLines={2}>
            {active?.raw_text ? displayIntentLine(active.raw_text) : "Message Noa to start matching…"}
          </Text>
        </Pressable>

        {connections.length ? (
          <View style={styles.stories}>
            <Text variant="small" muted style={styles.connectedLabel}>
              Connected
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesInner}>
              {connections.map((connection) => {
                const name = personName(connection.other_user);
                return (
                  <Pressable
                    key={connection.id}
                    onPress={() => router.push("/connections")}
                    style={({ pressed }) => [styles.story, pressed && styles.pressed]}
                  >
                    <Avatar name={name} imageUrl={personAvatarUrl(connection.other_user)} ring size={64} />
                    <Text variant="small" numberOfLines={1} style={styles.storyLabel}>
                      {name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {waiting.length ? (
          <View style={styles.stories}>
            <Text variant="small" muted style={styles.connectedLabel}>
              Waiting
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesInner}>
              {waiting.map((rec) => {
                const name = personName(rec.candidate);
                return (
                  <Pressable
                    key={rec.id}
                    onPress={() => router.push(`/person/${rec.id}` as never)}
                    style={({ pressed }) => [styles.story, pressed && styles.pressed]}
                  >
                    <Avatar name={name} imageUrl={personAvatarUrl(rec.candidate)} size={64} />
                    <Text variant="small" numberOfLines={1} style={styles.storyLabel}>
                      {name.split(" ")[0]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {matchEnabled ? (
          <>
            <View style={styles.sectionHead}>
              <Text variant="heading">In range</Text>
              <Pressable onPress={() => router.push("/discover")}>
                <Text variant="label" style={styles.link}>
                  List
                </Text>
              </Pressable>
            </View>

            {message ? (
              <Text variant="small" style={styles.notice}>
                {message}
              </Text>
            ) : null}

            {loading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={colors.ink} />
                <Text muted>Finding people in range…</Text>
              </View>
            ) : null}

            {!loading && browseItems.length ? (
              <RecommendationCarousel
                items={browseItems}
                onAskWei={setWeiRec}
                onDecide={decide}
                onOpen={(rec) => router.push(`/person/${rec.id}` as never)}
                onSave={toggleSave}
                savedIds={savedIds}
              />
            ) : null}

            {!loading && !browseItems.length ? (
              <View style={styles.empty}>
                <Text muted>{emptyHint || "Nothing new yet."}</Text>
                <Button onPress={() => void load()} variant="secondary">
                  Match again
                </Button>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.empty}>
            <Text muted>Tell Noa who you want to meet. Matches will swipe in here.</Text>
            <Button onPress={() => router.push("/ai")} variant="primary">
              Message Noa
            </Button>
          </View>
        )}
    </ScreenFrame>
    <WeiIntroSheet onClose={() => setWeiRec(null)} rec={weiRec} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    position: "relative",
  },
  content: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  intentRow: {
    gap: spacing.xs,
    paddingVertical: spacing.sm,
  },
  stories: {
    marginHorizontal: -spacing.page,
    gap: spacing.xs,
  },
  connectedLabel: {
    paddingHorizontal: spacing.page,
  },
  storiesInner: {
    gap: spacing.md,
    paddingHorizontal: spacing.page,
    paddingVertical: spacing.xs,
  },
  story: {
    alignItems: "center",
    width: 72,
    gap: spacing.xs,
  },
  storyLabel: {
    maxWidth: 72,
    textAlign: "center",
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  link: {
    color: colors.accent,
  },
  notice: {
    color: colors.accentMuted,
  },
  loading: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  empty: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  pressed: {
    opacity: 0.55,
  },
});
