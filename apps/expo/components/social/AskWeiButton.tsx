import React, { useRef } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { rememberNoaAnchor } from "@/components/social/WeiIntroSheet";
import { WeaveGuide } from "@/components/social/WeaveGuide";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";

type Props = {
  onPress: () => void;
  compact?: boolean;
  style?: ViewStyle;
};

export function AskWeiButton({ onPress, compact = false, style }: Props) {
  const ref = useRef<View>(null);
  const open = () => {
    const node = ref.current;
    let opened = false;
    const finish = () => {
      if (opened) return;
      opened = true;
      onPress();
    };
    if (!node?.measureInWindow) {
      finish();
      return;
    }
    const timer = setTimeout(finish, 180);
    node.measureInWindow((x, y, width, height) => {
      clearTimeout(timer);
      rememberNoaAnchor({ x, y, width, height });
      finish();
    });
  };

  return (
    <View ref={ref} collapsable={false} style={[styles.anchor, style]}>
    <Pressable
      accessibilityLabel="Ask Noa for their life index"
      onPress={open}
      style={({ pressed }) => [styles.chip, compact && styles.compact, pressed && styles.pressed]}
    >
      <View pointerEvents="none">
        <WeaveGuide size={compact ? 22 : 24} />
      </View>
      <Text variant="small" style={styles.label}>
        {compact ? "Noa" : "Ask Noa"}
      </Text>
    </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    paddingLeft: 4,
    paddingRight: 10,
    paddingVertical: 3,
  },
  compact: {
    paddingRight: 8,
  },
  label: {
    color: colors.accentMuted,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.7,
  },
  anchor: {
    alignSelf: "center",
  },
});
