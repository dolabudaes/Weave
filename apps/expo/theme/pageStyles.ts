import { useMemo } from "react";
import { Platform, StyleSheet, type ViewStyle } from "react-native";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, layout, spacing } from "./tokens";

export const pageStyles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
});

export function usePageLayout() {
  const { isWide, isDesktop, contentMaxWidth, pagePadding, phonePreview } = useResponsive();
  const bottomInset = isWide ? spacing.xxl : layout.tabBarHeight + spacing.md;

  return useMemo(() => {
    const scroll: ViewStyle = {
      flex: 1,
      minHeight: 0,
      backgroundColor: colors.bg,
    };

    const shell: ViewStyle = {
      width: "100%",
      maxWidth: isWide ? Math.min(contentMaxWidth, layout.railMax) : undefined,
      alignSelf: isWide ? "center" : undefined,
      backgroundColor: colors.bg,
      ...(isWide && Platform.OS === "web" && !phonePreview
        ? {
            borderLeftWidth: 1,
            borderRightWidth: 1,
            borderColor: colors.line,
          }
        : {}),
    };

    const tabPadding: ViewStyle = {
      paddingBottom: bottomInset,
      paddingHorizontal: pagePadding,
    };

    const pageGap: ViewStyle = {
      gap: spacing.lg,
    };

    return { scroll, shell, tabPadding, pageGap, isWide, isDesktop, contentMaxWidth, pagePadding, phonePreview, bottomInset };
  }, [bottomInset, contentMaxWidth, isDesktop, isWide, pagePadding, phonePreview]);
}
