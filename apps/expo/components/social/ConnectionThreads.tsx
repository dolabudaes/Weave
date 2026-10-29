import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";

type Props = {
  muted?: boolean;
  style?: ViewStyle | ViewStyle[];
};

const nodes = [
  { color: colors.lime, left: "8%", top: "36%" },
  { color: colors.ink, left: "38%", top: "62%" },
  { color: colors.lime, left: "68%", top: "28%" },
  { color: colors.subtle, left: "88%", top: "54%" },
] as const;

export function ConnectionThreads({ muted = false, style }: Props) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1600, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1600, toValue: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [muted ? 0.12 : 0.2, muted ? 0.2 : 0.34] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const slide = pulse.interpolate({ inputRange: [0, 1], outputRange: [-4, 4] });

  return (
    <View pointerEvents="none" style={[styles.layer, style]}>
      <Animated.View style={[styles.line, styles.lineA, { opacity, transform: [{ translateX: slide }, { rotate: "9deg" }] }]} />
      <Animated.View style={[styles.line, styles.lineB, { opacity, transform: [{ translateX: slide }, { rotate: "-10deg" }] }]} />
      {nodes.map((node) => (
        <Animated.View
          key={`${node.left}-${node.top}`}
          style={[
            styles.node,
            {
              backgroundColor: muted ? colors.card : node.color,
              borderColor: muted ? colors.line : colors.card,
              left: node.left,
              top: node.top,
              transform: [{ scale }],
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  line: {
    position: "absolute",
    left: "7%",
    height: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.lime,
  },
  lineA: {
    top: "45%",
    width: "86%",
  },
  lineB: {
    top: "58%",
    width: "72%",
    backgroundColor: colors.ink,
  },
  node: {
    position: "absolute",
    width: 12,
    height: 12,
    borderWidth: 2,
    borderRadius: 6,
  },
});
