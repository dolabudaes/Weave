import React from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Text } from "@/components/ui/Text";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, radius, spacing } from "@/theme/tokens";
import { composeWeaveUnderstanding } from "./profileDisplay";

type Props = {
  visible: boolean;
  initialText: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (text: string) => void;
};

export function AiFriendSheet({ visible, initialText, loading = false, onClose, onConfirm }: Props) {
  const { height } = useResponsive();
  const [draft, setDraft] = React.useState(initialText);

  React.useEffect(() => {
    if (visible) setDraft(initialText);
  }, [initialText, visible]);

  const understanding = composeWeaveUnderstanding(draft);
  const inputMaxHeight = Math.round(height * 0.28);

  return (
    <BottomSheet onClose={onClose} scrollable visible={visible}>
      <Text variant="heading" style={styles.title}>
        Who now?
      </Text>
      <TextInput
        multiline
        onChangeText={setDraft}
        placeholder="exhibitions, film, slow talk…"
        placeholderTextColor={colors.subtle}
        style={[styles.input, { maxHeight: inputMaxHeight }]}
        value={draft}
      />
      {draft.trim() ? (
        <View style={styles.hintBox}>
          <Text variant="small" muted>
            {understanding}
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button onPress={onClose} style={styles.actionBtn} variant="ghost">
          Cancel
        </Button>
        <Button onPress={() => onConfirm(draft)} style={styles.actionBtn} variant="primary">
          {loading ? "Sending…" : "Send"}
        </Button>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  title: {
    textAlign: "center",
  },
  input: {
    minHeight: 96,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
    color: colors.ink,
    fontSize: 15,
    lineHeight: 22,
    padding: spacing.md,
    textAlignVertical: "top",
  },
  hintBox: {
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    padding: spacing.md,
  },
  actions: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  actionBtn: {
    flex: 1,
  },
});
