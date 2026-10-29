import { StyleSheet, type ViewStyle } from "react-native";
import { colors, layout } from "./tokens";

export const compactTabBarStyle: ViewStyle = {
  position: "absolute",
  right: 0,
  bottom: 0,
  left: 0,
  height: layout.tabBarHeight,
  borderTopWidth: StyleSheet.hairlineWidth,
  borderColor: colors.line,
  backgroundColor: colors.bg,
  paddingBottom: 4,
  paddingTop: 6,
};

export const hiddenTabBarStyle: ViewStyle = {
  display: "none",
};
