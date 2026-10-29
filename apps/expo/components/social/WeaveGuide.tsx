import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";

type Props = {
  size?: number;
  listening?: boolean;
  style?: ViewStyle;
};

export const WEAVE_GUIDE = {
  name: "Noa",
  handle: "noa",
  title: "your mutual friend",
  greeting: "I'm Noa. Tell me who you want to meet. One sharp detail is enough.",
} as const;

export function WeaveGuide({ size = 72, listening = false, style }: Props) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 900, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 900, toValue: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.9] });

  return (
    <View style={[{ alignItems: "center", justifyContent: "center", height: size, width: size }, style]}>
      {listening ? (
        <Animated.View
          style={[
            styles.halo,
            {
              borderRadius: size / 2,
              height: size,
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
              width: size,
            },
          ]}
        />
      ) : null}
      <View
        style={[
          styles.face,
          {
            borderRadius: size / 2,
            height: size * 0.88,
            width: size * 0.88,
          },
        ]}
      >
        <View style={[styles.eye, { left: size * 0.24, top: size * 0.3, height: size * 0.09, width: size * 0.09 }]} />
        <View style={[styles.eye, { right: size * 0.24, top: size * 0.3, height: size * 0.09, width: size * 0.09 }]} />
        <View
          style={[
            styles.thread,
            {
              left: size * 0.22,
              top: size * 0.5,
              transform: [{ rotate: "28deg" }],
              width: size * 0.28,
              height: Math.max(2, size * 0.045),
            },
          ]}
        />
        <View
          style={[
            styles.thread,
            {
              right: size * 0.22,
              top: size * 0.5,
              transform: [{ rotate: "-28deg" }],
              width: size * 0.28,
              height: Math.max(2, size * 0.045),
            },
          ]}
        />
        <View
          style={[
            styles.knot,
            {
              height: size * 0.11,
              left: size * 0.385,
              top: size * 0.5,
              width: size * 0.11,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  halo: {
    position: "absolute",
    borderWidth: 2,
    borderColor: colors.accent,
  },
  face: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    overflow: "hidden",
  },
  eye: {
    position: "absolute",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  thread: {
    position: "absolute",
    borderRadius: radius.pill,
    backgroundColor: "#F4F4F5",
  },
  knot: {
    position: "absolute",
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
});
