import { Platform, useWindowDimensions } from "react-native";
import { usePreviewMetricsOptional, usePreviewModeOptional } from "@/features/preview/PreviewModeContext";

export const breakpoints = {
  tablet: 768,
  desktop: 1024,
} as const;

export const PHONE_LAYOUT = {
  width: 390,
  height: 844,
} as const;

export function useResponsive() {
  const window = useWindowDimensions();
  const preview = usePreviewModeOptional();
  const metrics = usePreviewMetricsOptional();
  const isDesktopWindow = window.width >= breakpoints.desktop;
  const phonePreview = Boolean(preview?.phonePreview && Platform.OS === "web" && isDesktopWindow);

  const width = phonePreview && metrics ? metrics.width : window.width;
  const height = phonePreview && metrics ? metrics.height : window.height;
  const isTablet = width >= breakpoints.tablet;
  const isDesktop = phonePreview ? false : window.width >= breakpoints.desktop;
  const isWide = isTablet && !phonePreview;

  const contentMaxWidth = phonePreview ? width : isDesktop ? 920 : isTablet ? 760 : width;
  const authMaxWidth = phonePreview ? width : isDesktop ? 1040 : isTablet ? 720 : width;
  const pagePadding = phonePreview ? 16 : isDesktop ? 32 : isTablet ? 24 : 20;

  return {
    width,
    height,
    isTablet,
    isDesktop,
    isWide,
    isCompact: !isWide,
    phonePreview,
    contentMaxWidth,
    authMaxWidth,
    pagePadding,
    sidebarWidth: 248,
  };
}
