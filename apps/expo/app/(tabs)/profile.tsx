import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AnimatedEntrance } from "@/components/social/AnimatedEntrance";
import { InterestTagList } from "@/components/social/InterestTagList";
import { SocialPostFeed } from "@/components/social/SocialPostGrid";
import { personAvatarUrl, personBio, personCity, personName, tagsFromSignals } from "@/components/social/profileDisplay";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Field } from "@/components/ui/Field";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { usePageLayout } from "@/theme/pageStyles";
import { colors, radius, spacing } from "@/theme/tokens";
import type { ProfileSignal, SocialPost, UserProfile, WeaveUser } from "@/types/weave";

export default function ProfileScreen() {
  const page = usePageLayout();
  const { api, logout, refreshMe, user } = useSession();
  const [signals, setSignals] = React.useState<ProfileSignal[]>([]);
  const [posts, setPosts] = React.useState<SocialPost[]>([]);
  const [draft, setDraft] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const loadProfile = React.useCallback(() => {
    api.request<ProfileSignal[]>("/profile/signals").then(setSignals).catch(() => setSignals([]));
    api.request<SocialPost[]>("/posts").then(setPosts).catch(() => setPosts([]));
  }, [api]);

  React.useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const displayName = personName(user ?? undefined);
  const introductionsPaused = user?.profile?.accepts_online === false || user?.profile?.accepts_online === 0;
  const interestTags = tagsFromSignals(signals);
  const authorDetail = personCity(user ?? undefined);
  const bio = personBio(user ?? undefined) || "Leave a small, true fragment. The right signal will find you.";

  const publishPost = async () => {
    const text = draft.trim();
    if (!text || publishing) {
      setNotice("Write one real fragment first.");
      return;
    }
    setPublishing(true);
    setNotice("");
    try {
      await api.request<SocialPost>("/posts", {
        body: JSON.stringify({
          city: personCity(user ?? undefined),
          is_used_for_profile: true,
          posted_at: new Date().toISOString(),
          text,
          visibility: "public_tags",
        }),
        method: "POST",
      });
      setDraft("");
      setNotice("That signal is in your space now.");
      loadProfile();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Couldn't publish");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.page}>
      <SocialPostFeed
        authorDetail={authorDetail}
        authorName={displayName}
        header={
          <View style={styles.headerContent}>
            <AnimatedEntrance>
              <View style={styles.topBar}>
                <Text variant="title">You</Text>
                <Pressable
                  accessibilityLabel="Settings"
                  onPress={() => setSettingsOpen(true)}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Ionicons color={colors.ink} name="settings-outline" size={20} />
                </Pressable>
              </View>
            </AnimatedEntrance>

            <AnimatedEntrance delay={50} style={styles.profileHeader}>
              <Avatar name={displayName} imageUrl={personAvatarUrl(user ?? undefined)} ring size={88} />
              <View style={styles.statsRow}>
                <Stat label="Signals" value={String(posts.length)} />
                <Stat label="Interests" value={String(interestTags.length)} />
              </View>
            </AnimatedEntrance>
            <View style={styles.profileMeta}>
              <Text variant="label">{displayName}</Text>
              <Text variant="small" muted>
                {bio}
              </Text>
              {!introductionsPaused ? (
                <Text variant="small" style={styles.openBadge}>
                  Open to intros
                </Text>
              ) : null}
            </View>

            {notice ? (
              <View style={styles.notice}>
                <Ionicons color={colors.ink} name="checkmark-circle-outline" size={18} />
                <Text>{notice}</Text>
              </View>
            ) : null}

            {interestTags.length ? (
              <AnimatedEntrance delay={90} style={styles.section}>
                <InterestTagList tags={interestTags} />
              </AnimatedEntrance>
            ) : null}

            <AnimatedEntrance delay={120} style={styles.section}>
              <ShareComposer authorName={displayName} draft={draft} onChangeText={setDraft} onPublish={publishPost} publishing={publishing} />
            </AnimatedEntrance>
          </View>
        }
        posts={posts}
      />
      <SettingsSheet
        onClose={() => setSettingsOpen(false)}
        onLogout={logout}
        onSaved={refreshMe}
        profile={user?.profile}
        request={(path, options) => api.request(path, options)}
        visible={settingsOpen}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="heading">{value}</Text>
      <Text variant="small" muted>
        {label}
      </Text>
    </View>
  );
}

function ShareComposer({
  authorName,
  draft,
  publishing,
  onChangeText,
  onPublish,
}: {
  authorName: string;
  draft: string;
  publishing: boolean;
  onChangeText: (text: string) => void;
  onPublish: () => void;
}) {
  return (
    <View style={styles.composer}>
      <View style={styles.composerTop}>
        <Avatar name={authorName} size={40} />
        <View style={styles.composerTitle}>
          <Text variant="label">{authorName}</Text>
          <Text variant="small" muted>New signal</Text>
        </View>
      </View>
      <Field multiline onChangeText={onChangeText} placeholder="What deserves to be seen today?" value={draft} />
      <View style={styles.composerActions}>
        <Button onPress={onPublish} variant="primary">{publishing ? "Publishing…" : "Publish"}</Button>
      </View>
    </View>
  );
}

type VisibilitySettings = {
  accepts_online: boolean;
  show_name: boolean;
  show_city: boolean;
  show_intent: boolean;
  show_signals: boolean;
  share_posts: boolean;
};

function prefOn(value: number | boolean | undefined, fallback = true) {
  if (value === undefined || value === null) return fallback;
  return value !== false && value !== 0;
}

function readVisibility(profile?: UserProfile): VisibilitySettings {
  return {
    accepts_online: prefOn(profile?.accepts_online, true),
    show_name: prefOn(profile?.show_name, true),
    show_city: prefOn(profile?.show_city, true),
    show_intent: prefOn(profile?.show_intent, true),
    show_signals: prefOn(profile?.show_signals, true),
    share_posts: prefOn(profile?.share_posts, true),
  };
}

function SettingsSheet({
  profile,
  visible,
  onClose,
  onLogout,
  onSaved,
  request,
}: {
  profile?: UserProfile;
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onSaved: () => Promise<void>;
  request: <T>(path: string, options?: RequestInit) => Promise<T>;
}) {
  const [form, setForm] = React.useState<VisibilitySettings>(() => readVisibility(profile));
  const [saving, setSaving] = React.useState(false);
  const [notice, setNotice] = React.useState("");

  React.useEffect(() => {
    if (visible) setForm(readVisibility(profile));
  }, [profile, visible]);

  React.useEffect(() => {
    if (visible) setNotice("");
  }, [visible]);

  const save = async (next: VisibilitySettings) => {
    const previous = form;
    setForm(next);
    setSaving(true);
    setNotice("");
    try {
      await request<WeaveUser>("/me/visibility", {
        body: JSON.stringify(next),
        method: "PUT",
      });
      await onSaved();
      setNotice("Saved");
    } catch (error) {
      setForm(previous);
      setNotice(error instanceof Error ? error.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet onClose={onClose} scrollable visible={visible}>
      <View style={styles.sheetTop}>
        <View style={styles.sheetTitle}>
          <Text variant="heading">Settings</Text>
          <Text muted variant="small">
            What people see before you connect
          </Text>
        </View>
        <Pressable accessibilityLabel="Close settings" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
          <Ionicons color={colors.ink} name="close" size={20} />
        </Pressable>
      </View>

      <View style={styles.settingsBlock}>
        <Text muted variant="small">
          Introductions
        </Text>
        <View style={styles.segment}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: form.accepts_online }}
            disabled={saving}
            onPress={() => void save({ ...form, accepts_online: true })}
            style={[styles.segmentItem, form.accepts_online && styles.segmentOn]}
          >
            <Text style={form.accepts_online ? styles.segmentOnText : undefined} variant="small">
              Open
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: !form.accepts_online }}
            disabled={saving}
            onPress={() => void save({ ...form, accepts_online: false })}
            style={[styles.segmentItem, !form.accepts_online && styles.segmentOn]}
          >
            <Text style={!form.accepts_online ? styles.segmentOnText : undefined} variant="small">
              Paused
            </Text>
          </Pressable>
        </View>
        <Text muted variant="small">
          {form.accepts_online ? "You can show up in new introductions." : "You stay out of new introductions. Existing chats stay."}
        </Text>
      </View>

      <View style={styles.settingsBlock}>
        <Text muted variant="small">
          Shown before you connect
        </Text>
        <View style={styles.settingGroup}>
          <SettingRow
            detail="Your username"
            disabled={saving}
            label="Name"
            onValueChange={(show_name) => void save({ ...form, show_name })}
            value={form.show_name}
          />
          <SettingRow
            detail="City, or Online"
            disabled={saving}
            label="City"
            onValueChange={(show_city) => void save({ ...form, show_city })}
            value={form.show_city}
          />
          <SettingRow
            detail="What you told Noa you want"
            disabled={saving}
            label="Current intent"
            onValueChange={(show_intent) => void save({ ...form, show_intent })}
            value={form.show_intent}
          />
          <SettingRow
            detail="Interest tags on a match"
            disabled={saving}
            label="Confirmed signals"
            last
            onValueChange={(show_signals) => void save({ ...form, show_signals })}
            value={form.show_signals}
          />
        </View>
      </View>

      <View style={styles.settingsBlock}>
        <Text muted variant="small">
          Posts
        </Text>
        <View style={styles.settingGroup}>
          <SettingRow
            detail="A match can read them. Strangers still don't get your whole feed."
            disabled={saving}
            label="Use posts to explain a match"
            last
            onValueChange={(share_posts) => void save({ ...form, share_posts })}
            value={form.share_posts}
          />
        </View>
      </View>

      <View style={styles.lockRow}>
        <Ionicons color={colors.muted} name="lock-closed-outline" size={16} />
        <Text muted variant="small" style={styles.lockText}>
          Chat opens only after you both agree. That stays on.
        </Text>
      </View>

      {notice ? (
        <Text muted variant="small">
          {notice}
        </Text>
      ) : null}

      <Button onPress={onLogout} style={styles.logout} variant="ghost">
        Log out
      </Button>
    </BottomSheet>
  );
}

function SettingRow({
  label,
  detail,
  value,
  disabled,
  last,
  onValueChange,
}: {
  label: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  last?: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={[styles.settingRow, last && styles.settingRowLast]}>
      <View style={styles.settingCopy}>
        <Text variant="label">{label}</Text>
        <Text muted variant="small">
          {detail}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={label}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        disabled={disabled}
        onPress={() => onValueChange(!value)}
        style={[styles.switchTrack, value && styles.switchOn]}
      >
        <View style={[styles.switchThumb, value && styles.switchThumbOn]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    position: "relative",
  },
  headerContent: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  iconButton: {
    alignItems: "center",
    justifyContent: "center",
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.xl,
  },
  stat: {
    alignItems: "center",
    gap: 2,
  },
  profileMeta: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  openBadge: {
    color: colors.accent,
    fontWeight: "600",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  section: {
    gap: spacing.md,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.md,
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
  composer: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  composerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  composerTitle: {
    flex: 1,
    gap: 1,
  },
  composerActions: {
    alignItems: "flex-end",
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
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  settingsBlock: {
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  segment: {
    flexDirection: "row",
    padding: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
  },
  segmentItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 36,
    borderRadius: radius.pill,
  },
  segmentOn: {
    backgroundColor: colors.ink,
  },
  segmentOnText: {
    color: colors.card,
    fontWeight: "700",
  },
  settingGroup: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
    overflow: "hidden",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  settingRowLast: {
    borderBottomWidth: 0,
  },
  settingCopy: {
    flex: 1,
    gap: 2,
  },
  switchTrack: {
    width: 46,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lineStrong,
    padding: 2,
    flexDirection: "row",
    alignItems: "center",
  },
  switchOn: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  switchThumbOn: {
    marginLeft: 18,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  lockText: {
    flex: 1,
    lineHeight: 18,
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  logout: {
    marginTop: spacing.lg,
  },
});
