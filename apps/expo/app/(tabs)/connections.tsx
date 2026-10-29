import React from "react";
import { useFocusEffect, useNavigation, useRouter } from "expo-router";
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ScreenFrame } from "@/components/layout/ScreenFrame";
import { Avatar } from "@/components/ui/Avatar";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { useResponsive } from "@/hooks/useResponsive";
import { compactTabBarStyle, hiddenTabBarStyle } from "@/theme/tabBar";
import { colors, radius, spacing } from "@/theme/tokens";
import type { Connection, ConnectionMessage } from "@/types/weave";
import { personAvatarUrl, personName } from "@/components/social/profileDisplay";

type MessageGroupData = {
  id: string;
  isMine: boolean;
  messages: ConnectionMessage[];
};

export default function ConnectionsScreen() {
  const { api, user } = useSession();
  const router = useRouter();
  const navigation = useNavigation();
  const { isWide } = useResponsive();
  const [connections, setConnections] = React.useState<Connection[]>([]);
  const [active, setActive] = React.useState<Connection | null>(null);
  const [messages, setMessages] = React.useState<ConnectionMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const rows = await api.request<Connection[]>("/connections");
      setConnections(rows);
    } catch {
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    React.useCallback(() => {
      void load();
    }, [load]),
  );

  React.useEffect(() => {
    if (isWide) {
      navigation.setOptions({ tabBarStyle: hiddenTabBarStyle });
      return;
    }
    navigation.setOptions({ tabBarStyle: active ? hiddenTabBarStyle : compactTabBarStyle });
    return () => {
      navigation.setOptions({ tabBarStyle: isWide ? hiddenTabBarStyle : compactTabBarStyle });
    };
  }, [active, isWide, navigation]);

  const open = async (connection: Connection) => {
    setActive(connection);
    setNotice("");
    const data = await api.request<ConnectionMessage[]>(`/connections/${connection.id}/messages`);
    setMessages(data);
  };

  const confirm = async (connection: Connection) => {
    await api.request(`/connections/${connection.id}/privacy-confirmation`, {
      body: JSON.stringify({ allowed_fields: ["Name", "City", "Current intent", "Confirmed signals"] }),
      method: "POST",
    });
    setNotice("Visibility set. You can talk now.");
    await load();
  };

  const send = async () => {
    if (!active || !draft.trim() || sending) return;
    setSending(true);
    setNotice("");
    try {
      await api.request(`/connections/${active.id}/messages`, { body: JSON.stringify({ content: draft.trim() }), method: "POST" });
      setDraft("");
      setMessages(await api.request<ConnectionMessage[]>(`/connections/${active.id}/messages`));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't send that.");
    } finally {
      setSending(false);
    }
  };

  const cancelLink = async () => {
    if (!active) return;
    await api.request(`/connections/${active.id}/close`, { method: "POST" });
    setActive(null);
    setDraft("");
    setMessages([]);
    setNotice("Link cancelled.");
    await load();
  };

  const suggestOpening = () => {
    if (!active) return;
    setDraft("Your latest posts have a mood. Want to start with one little thing?");
  };

  if (active) {
    return (
      <View style={styles.page}>
        <ChatView
          connection={active}
          draft={draft}
          messages={messages}
          notice={notice}
          onBack={() => {
            setActive(null);
            setDraft("");
            setNotice("");
            void load();
          }}
          onChangeDraft={setDraft}
          onOpenProfile={() => router.push(`/person/${active.recommendation_id}` as never)}
          onCancelLink={cancelLink}
          onSend={send}
          onSuggest={suggestOpening}
          sending={sending}
          userId={user?.id}
        />
      </View>
    );
  }

  return (
    <ScreenFrame contentStyle={styles.content}>
        <View style={styles.inboxHeader}>
          <Text variant="heading">Messages</Text>
        </View>
        {notice ? <Notice text={notice} /> : null}
        {loading ? <Text muted>Loading…</Text> : null}
        {!loading && connections.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text muted>Mutual matches land here. In development, user1 is already linked with user2.</Text>
          </View>
        ) : null}
        {connections.map((connection) => {
          const name = personName(connection.other_user);
          const isActive = connection.status === "active";
          const preview = isActive
            ? `Connected${connection.last_message_preview ? ` · ${connection.last_message_preview}` : ""}`
            : "It's mutual. Confirm visibility to open the thread.";
          return (
            <Pressable
              key={connection.id}
              onPress={() => (isActive ? open(connection) : confirm(connection).then(() => open(connection)))}
              style={({ pressed }) => [styles.inboxRow, pressed && styles.pressed]}
            >
              <Avatar name={name} imageUrl={personAvatarUrl(connection.other_user)} ring={isActive} size={56} />
              <View style={styles.inboxCopy}>
                <Text variant="label">{name}</Text>
                <Text muted numberOfLines={1} variant="small">
                  {preview}
                </Text>
              </View>
              {isActive ? <View style={styles.unreadDot} /> : null}
            </Pressable>
          );
        })}
    </ScreenFrame>
  );
}

function ChatView({
  connection,
  draft,
  messages,
  notice,
  sending,
  userId,
  onBack,
  onCancelLink,
  onChangeDraft,
  onOpenProfile,
  onSend,
  onSuggest,
}: {
  connection: Connection;
  draft: string;
  messages: ConnectionMessage[];
  notice: string;
  sending: boolean;
  userId?: number;
  onBack: () => void;
  onCancelLink: () => void;
  onChangeDraft: (text: string) => void;
  onOpenProfile: () => void;
  onSend: () => void;
  onSuggest: () => void;
}) {
  const insets = useSafeAreaInsets();
  const slide = React.useRef(new Animated.Value(26)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const groups = React.useMemo(() => groupMessages(messages, userId), [messages, userId]);
  const hasHumanMessages = messages.some((message) => message.sender_type !== "system");
  const name = personName(connection.other_user);
  const { isCompact } = useResponsive();
  const composerPad = Math.max(insets.bottom, spacing.sm);
  const composerHeight = (isCompact ? 34 : 36) + Math.max(0, draft.split("\n").length - 1) * 18;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { duration: 280, toValue: 0, useNativeDriver: true }),
      Animated.timing(opacity, { duration: 220, toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [opacity, slide]);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.chatPage}>
      <Animated.View style={[styles.chatPage, { opacity, transform: [{ translateX: slide }] }]}>
        <View style={styles.imessageTop}>
          <Pressable hitSlop={12} onPress={onBack} style={({ pressed }) => [styles.imessageBack, pressed && styles.pressed]}>
            <Ionicons color={colors.imessageBlue} name="chevron-back" size={32} />
          </Pressable>
          <Pressable onPress={onOpenProfile} style={({ pressed }) => [styles.imessageTitle, pressed && styles.pressed]}>
            <Avatar imageUrl={personAvatarUrl(connection.other_user)} name={name} size={40} />
            <Text variant="small">{name}</Text>
          </Pressable>
          <Pressable hitSlop={12} onPress={onCancelLink} style={({ pressed }) => [styles.cancelLink, pressed && styles.pressed]}>
            <Text variant="small" style={styles.cancelLinkText}>
              Cancel link
            </Text>
          </Pressable>
        </View>

        {notice ? <Notice text={notice} /> : null}

        <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <WeaveIntroMessage text={connection.introduction_message || ""} />
          {groups.map((group) => (
            <MessageGroup group={group} key={group.id} />
          ))}
          {!hasHumanMessages ? (
            <Pressable onPress={onSuggest} style={({ pressed }) => [styles.suggestChip, pressed && styles.pressed]}>
              <Text variant="small" style={styles.suggestText}>
                Need an opener?
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { paddingBottom: composerPad }]}>
          <TextInput
            multiline
            onChangeText={onChangeDraft}
            placeholder="Message"
            placeholderTextColor={colors.subtle}
            style={[styles.composerInput, isCompact && styles.composerInputCompact, { height: composerHeight }]}
            value={draft}
          />
          <Pressable
            disabled={!draft.trim() || sending}
            onPress={onSend}
            style={({ pressed }) => [styles.sendCircle, (!draft.trim() || sending) && styles.sendDisabled, pressed && styles.pressed]}
          >
            <Ionicons color={colors.bg} name="arrow-up" size={18} />
          </Pressable>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}

function WeaveIntroMessage({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <View style={styles.introWrap}>
      <Text muted variant="small">
        {text}
      </Text>
    </View>
  );
}

function MessageGroup({ group }: { group: MessageGroupData }) {
  return (
    <View style={[styles.messageGroup, group.isMine ? styles.messageGroupMine : styles.messageGroupTheirs]}>
      {group.messages.map((message) => (
        <View key={message.id} style={[styles.messageBubble, group.isMine ? styles.messageMine : styles.messageTheirs]}>
          <Text style={group.isMine ? styles.messageMineText : styles.messageTheirsText}>{message.content}</Text>
        </View>
      ))}
    </View>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <View style={styles.notice}>
      <Text variant="small">{text}</Text>
    </View>
  );
}

function groupMessages(messages: ConnectionMessage[], userId?: number) {
  const groups: MessageGroupData[] = [];
  for (const message of messages) {
    if (message.sender_type === "system") continue;
    const isMine = Boolean(userId && message.sender_user_id === userId);
    const last = groups[groups.length - 1];
    if (last && last.isMine === isMine) {
      last.messages.push(message);
    } else {
      groups.push({ id: `g-${message.id}`, isMine, messages: [message] });
    }
  }
  return groups;
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    position: "relative",
  },
  content: {
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  inboxHeader: {
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  emptyBlock: {
    paddingVertical: spacing.xxl,
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  inboxCopy: {
    flex: 1,
    gap: 2,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.55,
  },
  chatPage: {
    flex: 1,
    backgroundColor: colors.chatCanvas,
  },
  imessageTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  imessageBack: {
    width: 44,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  imessageTitle: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  cancelLink: {
    alignItems: "flex-end",
    justifyContent: "center",
    minWidth: 84,
  },
  cancelLinkText: {
    color: colors.imessageBlue,
  },
  messageList: {
    gap: spacing.sm,
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },
  introWrap: {
    borderRadius: radius.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  messageGroup: {
    gap: 2,
    marginBottom: 2,
  },
  messageGroupMine: {
    alignItems: "flex-end",
  },
  messageGroupTheirs: {
    alignItems: "flex-start",
  },
  messageBubble: {
    maxWidth: "78%",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  messageMine: {
    backgroundColor: colors.bubbleUser,
    borderRadius: 18,
    borderBottomRightRadius: 4,
  },
  messageTheirs: {
    backgroundColor: colors.bubbleFriend,
    borderRadius: 18,
    borderBottomLeftRadius: 4,
  },
  messageMineText: {
    color: colors.onBubble,
  },
  messageTheirsText: {
    color: colors.ink,
  },
  suggestChip: {
    alignSelf: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  suggestText: {
    color: colors.imessageBlue,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  composerInput: {
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
    paddingTop: 7,
    paddingBottom: 7,
  },
  composerInputCompact: {
    maxHeight: 68,
    borderRadius: 17,
    lineHeight: 18,
    paddingTop: 7,
    paddingBottom: 7,
  },
  sendCircle: {
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 16,
    marginBottom: 2,
    backgroundColor: colors.imessageBlue,
  },
  sendDisabled: {
    opacity: 0.35,
  },
  notice: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
});
