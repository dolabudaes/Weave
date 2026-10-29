import React from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { RecommendationCarousel } from "@/components/social/RecommendationCarousel";
import { displayIntentLine } from "@/components/social/profileDisplay";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { colors, spacing } from "@/theme/tokens";
import type { ConnectionIntent, Recommendation } from "@/types/weave";

export default function DiscoverScreen() {
  const { api } = useSession();
  const router = useRouter();
  const [intent, setIntent] = React.useState("");
  const [items, setItems] = React.useState<Recommendation[]>([]);
  const [message, setMessage] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [savedIds, setSavedIds] = React.useState<number[]>([]);

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      api.request<ConnectionIntent[]>("/intents").catch(() => []),
      api.request<Recommendation[]>("/recommendations").catch(() => []),
    ])
      .then(([intents, recommendations]) => {
        const active = intents.find((item) => item.status === "active");
        setIntent(active?.raw_text || "");
        setItems(
          recommendations.filter((rec) => rec.relationship !== "one_way" && rec.relationship !== "connected"),
        );
      })
      .finally(() => setLoading(false));
  }, [api]);

  React.useEffect(load, [load]);

  const decide = async (rec: Recommendation, decision: "not_relevant" | "interested") => {
    setMessage("");
    try {
      const data = await api.request<{ recommendation: Recommendation; connection?: unknown }>(`/recommendations/${rec.id}/decision`, {
        body: JSON.stringify({ decision }),
        method: "POST",
      });
      setItems((current) => current.filter((item) => item.id !== rec.id));
      setMessage(
        decision === "interested"
          ? data.connection
            ? "It's mutual. Open Messages."
            : "One-way for now. The thread opens if they lean in too."
          : "Passed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save that");
    }
  };

  const toggleSave = (rec: Recommendation) => {
    setSavedIds((current) => (current.includes(rec.id) ? current.filter((id) => id !== rec.id) : [...current, rec.id]));
  };

  return (
    <ScreenFrame contentStyle={styles.content}>
        <View style={styles.header}>
          <Text variant="heading">Discover</Text>
          <Pressable onPress={() => router.push("/ai")} style={({ pressed }) => pressed && styles.pressed}>
            <Ionicons color={colors.ink} name="sparkles-outline" size={24} />
          </Pressable>
        </View>

        <Text variant="small" muted numberOfLines={2}>
          {intent ? displayIntentLine(intent) : "Tune the ask. Refresh the match."}
        </Text>

        {message ? (
          <Text variant="small" style={styles.notice}>
            {message}
          </Text>
        ) : null}

        {loading ? (
          <View style={styles.loading}>
            <Text muted>Loading…</Text>
          </View>
        ) : null}

        {!loading && items.length ? (
          <RecommendationCarousel
            items={items}
            onDecide={decide}
            onOpen={(rec) => router.push(`/person/${rec.id}` as never)}
            onSave={toggleSave}
            savedIds={savedIds}
          />
        ) : null}

        {!loading && !items.length ? (
          <View style={styles.empty}>
            <Text variant="heading">No one yet</Text>
            <Text muted>A sharper ask lands a sharper match.</Text>
            <Button onPress={() => router.push("/ai")} variant="primary">
              Message Noa
            </Button>
          </View>
        ) : null}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  notice: {
    color: colors.accent,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
  empty: {
    alignItems: "flex-start",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  pressed: {
    opacity: 0.55,
  },
});
