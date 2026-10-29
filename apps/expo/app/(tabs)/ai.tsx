import React from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { AiRecommendCard } from "@/components/social/AiRecommendCard";
import { WEAVE_GUIDE, WeaveGuide } from "@/components/social/WeaveGuide";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, radius, spacing } from "@/theme/tokens";
import type { AiChatMessage, Recommendation } from "@/types/weave";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  recommendations?: Recommendation[];
  analysis?: string[];
};

type GuideAiStatus = {
  live?: boolean;
  model?: string;
  failed_reason?: string | null;
  used?: string;
};

const STARTERS = ["a slow talker who loves exhibitions", "someone who treats ordinary days like a lookbook"];

function fromServer(item: AiChatMessage): ChatMessage {
  return {
    id: String(item.id),
    role: item.role === "user" ? "user" : "assistant",
    text: item.content,
    recommendations: item.recommendations,
  };
}

export default function AiScreen() {
  const { api } = useSession();
  const { isCompact } = useResponsive();
  const router = useRouter();
  const { about, ask } = useLocalSearchParams<{ about?: string; ask?: string }>();
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [ready, setReady] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [aiStatus, setAiStatus] = React.useState<GuideAiStatus | null>(null);
  const askedAbout = React.useRef<string | null>(null);

  const loadThread = React.useCallback(async () => {
    try {
      const data = await api.request<{ items: AiChatMessage[]; ai?: GuideAiStatus }>("/guide/messages");
      setMessages((data.items || []).map(fromServer));
      setAiStatus(data.ai || null);
    } catch {
      setMessages([{ id: "welcome", role: "assistant", text: WEAVE_GUIDE.greeting }]);
    } finally {
      setReady(true);
    }
  }, [api]);

  React.useEffect(() => {
    void loadThread();
  }, [loadThread]);

  const send = React.useCallback(
    async (raw?: string, aboutId?: number) => {
      const trimmed = (raw ?? draft).trim() || (aboutId ? "What kind of person is this?" : "");
      if (!trimmed || loading) return;

      setMessages((current) => [...current, { id: `u-${Date.now()}`, role: "user", text: trimmed }]);
      setDraft("");
      setLoading(true);

      try {
        const data = await api.request<{ assistant_message: AiChatMessage; ai?: GuideAiStatus; analysis?: { label?: string }[] }>("/guide/chat", {
          body: JSON.stringify({
            content: trimmed,
            about_recommendation_id: aboutId || null,
          }),
          method: "POST",
        });
        const next = fromServer(data.assistant_message);
        const labels = (data.analysis || []).map((item) => item.label?.trim() || "").filter(Boolean);
        setAiStatus(data.ai || null);
        setMessages((current) => [...current, labels.length ? { ...next, analysis: labels } : next]);
      } catch (error) {
        setMessages((current) => [
          ...current,
          {
            id: `e-${Date.now()}`,
            role: "assistant",
            text: error instanceof Error ? error.message : "That search slipped. Try once more.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [api, draft, loading],
  );

  React.useEffect(() => {
    if (!ready || loading || !about || !ask) return;
    if (askedAbout.current === ask) return;
    const recId = Number(about);
    if (!Number.isFinite(recId) || recId <= 0) return;
    askedAbout.current = ask;
    void send("What kind of person is this?", recId);
  }, [about, ask, loading, ready, send]);

  const showStarters = messages.length <= 1 && !loading;
  const modeLabel = aiStatus?.live ? `Live model · ${aiStatus.model || "connected"}` : aiStatus?.failed_reason ? "Local rules · live model is not configured" : WEAVE_GUIDE.title;
  const inputBase = isCompact ? 34 : 38;
  const inputHeight = Math.min(isCompact ? 68 : 96, inputBase + Math.max(0, draft.split("\n").length - 1) * 18);

  return (
    <ScreenFrame
      contentStyle={styles.thread}
      footer={
        <View style={styles.composerWrap}>
          {loading ? (
            <View style={styles.typing}>
              <View style={styles.dot} />
              <View style={[styles.dot, styles.dotMid]} />
              <View style={styles.dot} />
              <Text muted variant="small">
                Noa is typing
              </Text>
            </View>
          ) : null}
          {showStarters ? (
            <ScrollView
              horizontal
              contentContainerStyle={styles.starters}
              keyboardShouldPersistTaps="handled"
              showsHorizontalScrollIndicator={false}
              style={styles.starterScroll}
            >
              {STARTERS.map((item) => (
                <Pressable key={item} onPress={() => void send(item)} style={({ pressed }) => [styles.starter, pressed && styles.pressed]}>
                  <Text numberOfLines={1} variant="small">
                    {item}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          <View style={styles.composer}>
            <TextInput
              multiline
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor={colors.subtle}
              style={[styles.input, isCompact && styles.inputCompact, { height: inputHeight }]}
              value={draft}
            />
            <Pressable
              accessibilityLabel="Send to Noa"
              disabled={!draft.trim() || loading}
              onPress={() => void send()}
              style={({ pressed }) => [styles.sendBtn, isCompact && styles.sendBtnCompact, draft.trim() && !loading ? styles.sendOn : styles.sendOff, pressed && styles.pressed]}
            >
              <Ionicons color={colors.onBubble} name="arrow-up" size={18} />
            </Pressable>
          </View>
        </View>
      }
      header={
        <Pressable style={styles.header}>
          <WeaveGuide listening={loading} size={52} />
          <Text variant="label">{WEAVE_GUIDE.name}</Text>
          <Text muted variant="small">
            {modeLabel}
          </Text>
        </Pressable>
      }
    >
      {messages.map((item) => (
        <View key={item.id} style={[styles.row, item.role === "user" ? styles.userRow : styles.assistantRow]}>
          {item.role === "assistant" ? <WeaveGuide size={28} /> : null}
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
            <Text style={item.role === "user" ? styles.userText : undefined}>{item.text}</Text>
            {item.analysis?.length ? (
              <Text muted variant="small">
                Noted: {item.analysis.join(", ")}
              </Text>
            ) : null}
            {item.recommendations?.length ? (
              <View style={styles.recList}>
                {item.recommendations.map((rec) => (
                  <AiRecommendCard key={rec.id} onPress={() => router.push(`/person/${rec.id}` as never)} rec={rec} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      ))}
    </ScreenFrame>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    gap: 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  thread: {
    gap: 6,
    paddingTop: spacing.lg,
    backgroundColor: colors.chatCanvas,
  },
  starterScroll: {
    flexGrow: 0,
    marginHorizontal: -spacing.page,
  },
  starters: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.page,
  },
  starter: {
    borderRadius: radius.pill,
    backgroundColor: colors.bubbleFriend,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    width: "100%",
    marginBottom: 2,
  },
  userRow: {
    justifyContent: "flex-end",
  },
  assistantRow: {
    justifyContent: "flex-start",
  },
  bubble: {
    maxWidth: "78%",
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    backgroundColor: colors.bubbleUser,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.bubbleFriend,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: colors.onBubble,
  },
  recList: {
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  composerWrap: {
    width: "100%",
    gap: spacing.sm,
    backgroundColor: colors.bg,
    paddingTop: spacing.xs,
  },
  typing: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.subtle,
  },
  dotMid: {
    opacity: 0.7,
  },
  composer: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minWidth: 0,
    maxHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    borderRadius: 18,
    backgroundColor: colors.bg,
    color: colors.ink,
    fontSize: 16,
    lineHeight: 20,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as const } : null),
  },
  inputCompact: {
    maxHeight: 68,
    borderRadius: 17,
    fontSize: 16,
    lineHeight: 18,
    paddingTop: 7,
    paddingBottom: 7,
  },
  sendBtn: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 2,
  },
  sendBtnCompact: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginBottom: 3,
  },
  sendOn: {
    backgroundColor: colors.imessageBlue,
  },
  sendOff: {
    backgroundColor: colors.subtle,
  },
  pressed: {
    opacity: 0.7,
  },
});
