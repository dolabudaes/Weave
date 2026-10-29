import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";

type Props = {
  muted?: boolean;
  style?: ViewStyle | ViewStyle[];
};

const threads = [
  { color: colors.ink, left: "-8%", rotate: "-18deg", top: "18%", width: "62%" },
  { color: colors.lime, left: "34%", rotate: "22deg", top: "20%", width: "78%" },
  { color: colors.muted, left: "2%", rotate: "16deg", top: "62%", width: "72%" },
  { color: colors.lineStrong, left: "42%", rotate: "-14deg", top: "70%", width: "64%" },
] as const;

const nodes = [
  { backgroundColor: colors.ink, left: "14%", top: "26%" },
  { backgroundColor: colors.lime, left: "72%", top: "28%" },
  { backgroundColor: colors.muted, left: "26%", top: "74%" },
  { backgroundColor: colors.lineStrong, left: "84%", top: "68%" },
] as const;

export function WovenThreads({ muted = false, style }: Props) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1700, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1700, toValue: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const lineOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [muted ? 0.12 : 0.2, muted ? 0.2 : 0.34] });
  const nodeScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const drift = pulse.interpolate({ inputRange: [0, 1], outputRange: [-3, 3] });

  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      {threads.map((thread) => (
        <Animated.View
          key={`${thread.color}-${thread.top}`}
          style={[
            styles.thread,
            {
              backgroundColor: muted ? colors.line : thread.color,
              left: thread.left,
              opacity: lineOpacity,
              top: thread.top,
              transform: [{ rotate: thread.rotate }, { translateX: drift }],
              width: thread.width,
            },
          ]}
        />
      ))}
      {nodes.map((node) => (
        <Animated.View
          key={`${node.left}-${node.top}`}
          style={[
            styles.node,
            {
              backgroundColor: muted ? colors.card : node.backgroundColor,
              borderColor: muted ? colors.line : colors.card,
              left: node.left,
              top: node.top,
              transform: [{ scale: nodeScale }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  thread: {
    position: "absolute",
    height: 3,
    borderRadius: radius.pill,
  },
  node: {
    position: "absolute",
    width: 12,
    height: 12,
    borderWidth: 2,
    borderRadius: 6,
  },
});
