import React, { type ReactNode } from "react";
import { Animated, type ViewStyle } from "react-native";

type Props = {
  children: ReactNode;
  delay?: number;
  distance?: number;
  style?: ViewStyle | ViewStyle[];
};

export function AnimatedEntrance({ children, delay = 0, distance = 12, style }: Props) {
  const opacity = React.useRef(new Animated.Value(0)).current;
  const translateY = React.useRef(new Animated.Value(distance)).current;

  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { delay, duration: 260, toValue: 1, useNativeDriver: true }),
      Animated.spring(translateY, { delay, friction: 8, tension: 120, toValue: 0, useNativeDriver: true }),
    ]).start();
  }, [delay, distance, opacity, translateY]);

  return (
    <Animated.View style={[{ opacity, transform: [{ translateY }] }, style]}>
      {children}
    </Animated.View>
  );
}
