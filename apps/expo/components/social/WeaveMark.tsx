import React from "react";
import { Animated, StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";

type Props = {
  size?: number;
  muted?: boolean;
  animated?: boolean;
  style?: ViewStyle | ViewStyle[];
};

export function WeaveMark({ size = 48, muted = false, animated = false, style }: Props) {
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (!animated) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { duration: 1200, toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 1200, toValue: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animated, pulse]);

  const dotScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.22] });
  const stroke = Math.max(2.2, size * 0.07);
  const threadColor = muted ? colors.subtle : colors.ink;
  const accentColor = muted ? colors.lineStrong : colors.lime;

  return (
    <View style={[styles.wrap, { borderRadius: size / 2, height: size, width: size }, style]}>
      {[
        { left: 0.12, rotate: "62deg", top: 0.48 },
        { left: 0.27, rotate: "-62deg", top: 0.54 },
        { left: 0.46, rotate: "62deg", top: 0.54 },
        { left: 0.61, rotate: "-62deg", top: 0.48 },
      ].map((strand, index) => (
        <View
          key={`${strand.rotate}-${index}`}
          style={[
            styles.strand,
            {
              backgroundColor: threadColor,
              height: stroke,
              left: size * strand.left,
              top: size * strand.top,
              transform: [{ rotate: strand.rotate }],
              width: size * 0.31,
            },
          ]}
        />
      ))}
      <Animated.View
        style={[
          styles.centerDot,
          {
            backgroundColor: accentColor,
            height: size * 0.115,
            left: size * 0.442,
            top: size * 0.486,
            transform: [{ scale: animated ? dotScale : 1 }],
            width: size * 0.115,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    overflow: "hidden",
  },
  strand: {
    position: "absolute",
    borderRadius: radius.pill,
  },
  centerDot: {
    position: "absolute",
    borderRadius: radius.pill,
  },
});
