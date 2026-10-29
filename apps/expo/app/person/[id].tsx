import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedEntrance } from "@/components/social/AnimatedEntrance";
import { AskWeiButton } from "@/components/social/AskWeiButton";
import { SocialPostFeed } from "@/components/social/SocialPostGrid";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { colors, layout, radius, shadows, spacing } from "@/theme/tokens";
import type { Recommendation } from "@/types/weave";
import { personAvatarUrl, personCity, personName, displayIntentLine } from "@/components/social/profileDisplay";
import { WeiIntroSheet } from "@/components/social/WeiIntroSheet";

export default function PersonSpaceScreen() {
  const { api, loading: sessionLoading, session } = useSession();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rec, setRec] = React.useState<Recommendation | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notice, setNotice] = React.useState("");
  const [askWei, setAskWei] = React.useState(false);

  React.useEffect(() => {
    if (sessionLoading) return;
    if (!session) {
      setLoading(false);
      router.replace("/login");
      return;
    }
    setLoading(true);
    api.request<Recommendation>(`/recommendations/${id}`)
      .then((item) => setRec(item))
      .catch(() => setRec(null))
      .finally(() => setLoading(false));
  }, [api, id, router, session, sessionLoading]);

  const decide = async (decision: "not_relevant" | "interested") => {
    if (!rec) return;
    setNotice("");
    try {
      const data = await api.request<{ recommendation: Recommendation; connection?: unknown }>(`/recommendations/${rec.id}/decision`, {
        body: JSON.stringify({ decision }),
        method: "POST",
      });
      setRec(data.recommendation);
      setNotice(
        decision === "interested"
          ? data.connection
            ? "It's mutual. Open Messages."
            : "One-way for now. The thread opens if they lean in too."
          : "Not interested. Noa will keep that in mind.",
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save that choice");
    }
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!rec) {
    return (
      <View style={styles.loading}>
        <Text variant="heading">Profile not found</Text>
        <Button onPress={() => router.back()} style={styles.backButton}>Back</Button>
      </View>
    );
  }

  const name = personName(rec.candidate);
  const city = personCity(rec.candidate);
  const intentText = rec.candidate_context?.active_intent?.raw_text;
  const intent = intentText ? displayIntentLine(intentText) : "";
  const posts = rec.candidate_context?.posts || [];

  return (
    <View style={[styles.page, styles.pageHost]}>
      <SocialPostFeed
        authorName={name}
        header={
          <View style={styles.headerContent}>
            <View style={styles.nav}>
              <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
                <Ionicons color={colors.ink} name="chevron-back" size={22} />
              </Pressable>
              <Text variant="label">Match</Text>
              <AskWeiButton onPress={() => setAskWei(true)} />
            </View>

            <AnimatedEntrance style={styles.profileStage}>
              <View style={styles.stageTop}>
                <View style={styles.avatarWrap}>
                  <Avatar name={name} imageUrl={personAvatarUrl(rec.candidate)} size={92} />
                </View>
              </View>
              <View style={styles.nameBlock}>
                <Text variant="hero">{name}</Text>
                {city ? (
                  <Text muted variant="small">
                    {city}
                  </Text>
                ) : null}
                {intent ? (
                  <Text muted numberOfLines={2}>
                    {intent}
                  </Text>
                ) : null}
              </View>
            </AnimatedEntrance>

            {notice ? (
              <View style={styles.notice}>
                <Ionicons color={colors.ink} name="checkmark-circle-outline" size={18} />
                <Text>{notice}</Text>
              </View>
            ) : null}
          </View>
        }
        footer={<View style={styles.ctaSpacer} />}
        posts={posts}
      />
      <View style={styles.ctaBar}>
        <Button onPress={() => decide("not_relevant")} style={styles.cta}>
          Not interested
        </Button>
        {rec.relationship === "connected" ? (
          <Button onPress={() => router.push("/connections")} style={styles.cta} variant="primary">
            Open Messages
          </Button>
        ) : rec.relationship === "one_way" ? (
          <Button
            onPress={async () => {
              if (!rec) return;
              setNotice("");
              try {
                const data = await api.request<{ recommendation: Recommendation; connection?: { id?: number } | null }>(
                  `/recommendations/${rec.id}/agree`,
                  { method: "POST" },
                );
                setRec(data.recommendation);
                if (data.connection) {
                  router.push("/connections");
                  return;
                }
                setNotice("Still waiting on them.");
              } catch (error) {
                setNotice(error instanceof Error ? error.message : "Could not save that choice");
              }
            }}
            style={styles.cta}
            variant="primary"
          >
            Agree
          </Button>
        ) : (
          <Button onPress={() => decide("interested")} style={styles.cta} variant="primary">
            Interested
          </Button>
        )}
      </View>
      <WeiIntroSheet onClose={() => setAskWei(false)} rec={askWei ? rec : null} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  pageHost: {
    position: "relative",
  },
  headerContent: {
    gap: spacing.lg,
    paddingTop: spacing.page,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
    backgroundColor: colors.bg,
    padding: spacing.page,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  profileStage: {
    gap: spacing.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    padding: spacing.lg,
  },
  stageTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  avatarWrap: {
    alignSelf: "flex-start",
    padding: 5,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    ...shadows.card,
  },
  stagePill: {
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  stagePillText: {
    color: colors.lime,
    fontWeight: "800",
  },
  nameBlock: {
    gap: spacing.sm,
  },
  stageName: {
    color: colors.ink,
  },
  stageTags: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    padding: spacing.md,
  },
  section: {
    gap: spacing.md,
  },
  signalSection: {
    gap: spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: colors.lime,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    paddingLeft: spacing.md,
    paddingVertical: spacing.md,
    paddingRight: spacing.md,
  },
  signalLabel: {
    color: colors.success,
    fontWeight: "800",
  },
  ctaBar: {
    position: "absolute",
    alignSelf: "center",
    width: "100%",
    maxWidth: layout.screenMax,
    bottom: 0,
    flexDirection: "row",
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.card,
    padding: spacing.page,
  },
  cta: {
    flex: 1,
  },
  ctaSpacer: {
    height: 56,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  backButton: {
    minWidth: 120,
  },
});
