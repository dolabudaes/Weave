import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme/tokens";
import { Text } from "./Text";

type Props = {
  children: ReactNode;
  tone?: "lime" | "soft" | "outline" | "warning";
};

export function Pill({ children, tone = "soft" }: Props) {
  return (
    <View style={[styles.pill, styles[tone]]}>
      <Text
        variant="small"
        style={tone === "lime" ? styles.limeText : tone === "warning" ? styles.warningText : undefined}
        muted={tone !== "lime" && tone !== "warning"}
      >
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  lime: {
    borderColor: colors.accentMuted,
    backgroundColor: colors.accentSoft,
  },
  soft: {
    backgroundColor: colors.surface,
  },
  outline: {
    borderColor: colors.lineStrong,
    backgroundColor: "transparent",
  },
  warning: {
    borderColor: colors.line,
    backgroundColor: colors.dangerBg,
  },
  limeText: {
    color: colors.accent,
    fontWeight: "600",
  },
  warningText: {
    color: colors.warning,
  },
});
