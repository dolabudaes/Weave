import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, layout, radius, spacing } from "@/theme/tokens";

type Props = {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
  scrollable?: boolean;
  maxHeightRatio?: number;
  sheetStyle?: ViewStyle;
};

export function BottomSheet({ visible, onClose, children, scrollable = false, maxHeightRatio = 0.92, sheetStyle }: Props) {
  const { width, height, phonePreview, isCompact } = useResponsive();
  const sheetWidth = phonePreview || isCompact ? width : Math.min(width, layout.screenMax);
  const maxSheetHeight = Math.round(height * maxHeightRatio);
  const bottomPad = Platform.OS === "ios" ? spacing.xxl + 8 : spacing.xxl;

  if (!visible) return null;

  const sheetBody = (
    <>
      <View style={styles.handle} />
      {children}
    </>
  );

  const panel = scrollable ? (
    <ScrollView
      bounces={false}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ maxHeight: maxSheetHeight, width: sheetWidth }}
      contentContainerStyle={[styles.sheet, { paddingBottom: bottomPad }, sheetStyle]}
    >
      {sheetBody}
    </ScrollView>
  ) : (
    <View style={[styles.sheet, { width: sheetWidth, maxWidth: sheetWidth, maxHeight: maxSheetHeight, paddingBottom: bottomPad }, sheetStyle]}>
      {sheetBody}
    </View>
  );

  const overlay = (
    <View
      style={[
        styles.overlay,
        Platform.OS === "web" && phonePreview ? { width, height } : undefined,
      ]}
    >
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.scrim} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.keyboard}>
        {panel}
      </KeyboardAvoidingView>
    </View>
  );

  if (Platform.OS === "web") {
    return overlay;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 2000,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.overlay,
  },
  keyboard: {
    justifyContent: "flex-end",
    width: "100%",
  },
  sheet: {
    alignSelf: "center",
    gap: spacing.md,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginBottom: spacing.xs,
  },
});
