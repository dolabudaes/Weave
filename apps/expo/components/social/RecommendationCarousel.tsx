import React from "react";
import { Animated, PanResponder, StyleSheet, View } from "react-native";
import { RecommendationCard } from "@/components/social/RecommendationCard";
import { Text } from "@/components/ui/Text";
import { useResponsive } from "@/hooks/useResponsive";
import { spacing } from "@/theme/tokens";
import type { Recommendation } from "@/types/weave";

type Props = {
  items: Recommendation[];
  onOpen: (rec: Recommendation) => void;
  onDecide: (rec: Recommendation, decision: "not_relevant" | "interested") => void;
  onAskWei?: (rec: Recommendation) => void;
  onSave?: (rec: Recommendation) => void;
  savedIds?: number[];
};

export function RecommendationCarousel({ items, onOpen, onDecide, onAskWei, onSave, savedIds = [] }: Props) {
  const { width } = useResponsive();
  const [index, setIndex] = React.useState(0);
  const pan = React.useRef(new Animated.Value(0)).current;
  const enterX = React.useRef(new Animated.Value(16)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const swipeThreshold = Math.min(72, width * 0.18);
  const current = items[index];
  const next = items[(index + 1) % items.length];
  const canBrowse = items.length > 1;

  React.useEffect(() => {
    setIndex(0);
    pan.setValue(0);
  }, [items, pan]);

  React.useEffect(() => {
    enterX.setValue(16);
    opacity.setValue(0);
    Animated.parallel([
      Animated.timing(enterX, { duration: 220, toValue: 0, useNativeDriver: true }),
      Animated.timing(opacity, { duration: 220, toValue: 1, useNativeDriver: true }),
    ]).start();
  }, [enterX, index, opacity]);

  const nextScale = pan.interpolate({
    inputRange: [-220, 0, 220],
    outputRange: [1, 0.98, 1],
    extrapolate: "clamp",
  });
  const translateX = Animated.add(pan, enterX);

  const responder = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => canBrowse && Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
        onPanResponderMove: Animated.event([null, { dx: pan }], { useNativeDriver: false }),
        onPanResponderRelease: (_, gesture) => {
          if (Math.abs(gesture.dx) > swipeThreshold) {
            const direction = gesture.dx > 0 ? -1 : 1;
            Animated.timing(pan, { duration: 160, toValue: -direction * 360, useNativeDriver: true }).start(() => {
              pan.setValue(0);
              setIndex((value) => (value + direction + items.length) % items.length);
            });
            return;
          }
          Animated.spring(pan, { friction: 8, tension: 120, toValue: 0, useNativeDriver: true }).start();
        },
      }),
    [canBrowse, items.length, pan, swipeThreshold],
  );

  if (!current) return null;

  return (
    <View style={styles.carousel}>
      {canBrowse && next ? (
        <Animated.View pointerEvents="none" style={[styles.nextCard, { transform: [{ scale: nextScale }] }]}>
          <RecommendationCard onDecide={() => undefined} onOpen={() => undefined} rec={next} saved={savedIds.includes(next.id)} />
        </Animated.View>
      ) : null}
      <Animated.View {...responder.panHandlers} style={{ opacity, transform: [{ translateX }] }}>
        <RecommendationCard
          onAskWei={onAskWei ? () => onAskWei(current) : undefined}
          onDecide={(decision) => onDecide(current, decision)}
          onOpen={() => onOpen(current)}
          onSave={onSave ? () => onSave(current) : undefined}
          rec={current}
          saved={savedIds.includes(current.id)}
        />
      </Animated.View>
      {canBrowse ? (
        <Text variant="small" subtle style={styles.counter}>
          Swipe · {index + 1} / {items.length}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  carousel: {
    position: "relative",
    gap: spacing.sm,
    width: "100%",
  },
  nextCard: {
    position: "absolute",
    top: 8,
    right: 0,
    left: 0,
    opacity: 0.5,
  },
  counter: {
    textAlign: "center",
    paddingTop: spacing.xs,
  },
});
