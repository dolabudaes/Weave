import type { ReactNode } from "react";
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PreviewMetricsProvider, usePreviewMode } from "@/features/preview/PreviewModeContext";
import { breakpoints, PHONE_LAYOUT } from "@/hooks/useResponsive";
import { colors, radius, shadows, spacing } from "@/theme/tokens";

type Props = {
  children: ReactNode;
};

function computeFrameSize(windowWidth: number, windowHeight: number) {
  const maxW = Math.min(PHONE_LAYOUT.width, windowWidth - 48);
  const maxH = Math.min(PHONE_LAYOUT.height, windowHeight - 96);
  const aspect = PHONE_LAYOUT.width / PHONE_LAYOUT.height;
  let height = maxH;
  let width = Math.round(height * aspect);
  if (width > maxW) {
    width = maxW;
    height = Math.round(width / aspect);
  }
  width = Math.max(320, width);
  height = Math.max(560, height);
  return { width, height };
}

export function AppPreviewShell({ children }: Props) {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { phonePreview, togglePhonePreview } = usePreviewMode();
  const isDesktopWeb = Platform.OS === "web" && windowWidth >= breakpoints.desktop;

  if (!isDesktopWeb) {
    return <>{children}</>;
  }

  const frame = computeFrameSize(windowWidth, windowHeight);
  const bezel = 8;

  return (
    <View style={styles.desktopRoot}>
      {phonePreview ? (
        <View style={styles.stage}>
          <View style={[styles.phoneOuter, { width: frame.width + bezel * 2 + 16, height: frame.height + bezel * 2 + 16 }]}>
            <View style={[styles.phoneBezel, { width: frame.width + bezel * 2, height: frame.height + bezel * 2 }]}>
              <PreviewMetricsProvider height={frame.height} width={frame.width}>
                <View style={[styles.appHost, { width: frame.width, height: frame.height }]}>{children}</View>
              </PreviewMetricsProvider>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.fullBleed}>{children}</View>
      )}

      <Pressable
        accessibilityLabel={phonePreview ? "Switch to desktop" : "Switch to phone preview"}
        onPress={togglePhonePreview}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed, webFixedFab]}
      >
        <Ionicons color={colors.bg} name={phonePreview ? "desktop-outline" : "phone-portrait-outline"} size={20} />
        <Text style={styles.fabLabel}>{phonePreview ? "Desktop" : "Phone"}</Text>
      </Pressable>
    </View>
  );
}

const webFixedFab: ViewStyle =
  Platform.OS === "web"
    ? {
        position: "fixed",
        bottom: 24,
        left: 24,
        zIndex: 10000,
      }
    : {
        position: "absolute",
        bottom: spacing.xl,
        left: spacing.xl,
        zIndex: 10000,
      };

const styles = StyleSheet.create({
  desktopRoot: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  fullBleed: {
    flex: 1,
    minHeight: 0,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
    minHeight: 0,
  },
  phoneOuter: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 44,
    backgroundColor: "#1C1C1E",
    ...shadows.card,
  },
  phoneBezel: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 38,
    backgroundColor: "#2C2C2E",
    overflow: "hidden",
  },
  appHost: {
    overflow: "hidden",
    backgroundColor: colors.bg,
    borderRadius: 32,
  },
  fab: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    ...shadows.soft,
  },
  fabPressed: {
    opacity: 0.85,
  },
  fabLabel: {
    color: colors.bg,
    fontSize: 13,
    fontWeight: "600",
  },
});
