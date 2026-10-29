import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsive } from "@/hooks/useResponsive";
import { useSession } from "@/features/auth/session";
import { WEAVE_GUIDE, WeaveGuide } from "@/components/social/WeaveGuide";
import { markNoaBriefSeen, noaBriefSeen, readLifeIndexes, type LifeChip } from "@/components/social/noaIntro";
import { lifeIndexBuckets, lifeIndexKey, personName } from "@/components/social/profileDisplay";
import { Text } from "@/components/ui/Text";
import { colors, radius, spacing } from "@/theme/tokens";
import type { GoldProfile, Recommendation } from "@/types/weave";

type Props = {
  rec: Recommendation | null;
  onClose: () => void;
};

type Anchor = { x: number; y: number; width: number; height: number };
type Slot = { top: number; left: number; width: number; fromY: number; origin: "top right" | "bottom right" };

const SHEET_BG = "#FBFAF7";
const SHEET_LINE = "#E8E6E0";

let pendingAnchor: Anchor | null = null;

export function rememberNoaAnchor(anchor: Anchor) {
  pendingAnchor = anchor;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted && value) setReduced(true);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      if (mounted) setReduced(value);
    });
    let query: MediaQueryList | null = null;
    const onChange = (event: MediaQueryListEvent) => {
      if (mounted) setReduced(event.matches);
    };
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
      query = window.matchMedia("(prefers-reduced-motion: reduce)");
      if (query.matches) setReduced(true);
      query.addEventListener?.("change", onChange);
    }
    return () => {
      mounted = false;
      sub.remove();
      query?.removeEventListener?.("change", onChange);
    };
  }, []);

  return reduced;
}

function sequenceFor(chips: LifeChip[], bucket: LifeChip["bucket"]) {
  const you = chips.filter((chip) => chip.bucket === bucket && chip.side === "you");
  const them = chips.filter((chip) => chip.bucket === bucket && chip.side === "them");
  const seq: LifeChip[] = [];
  const rows = Math.max(you.length, them.length);
  for (let row = 0; row < rows; row += 1) {
    if (you[row]) seq.push(you[row]);
    if (them[row]) seq.push(them[row]);
  }
  return seq;
}

function riseStyle(value: Animated.Value) {
  return {
    opacity: value,
    transform: [
      {
        translateY: value.interpolate({
          inputRange: [0, 1],
          outputRange: [10, 0],
        }),
      },
    ],
  };
}

function placeCard(anchor: Anchor | null, originX: number, originY: number, boundsWidth: number, boundsHeight: number): Slot {
  const margin = 16;
  const width = Math.min(440, Math.max(320, boundsWidth - margin * 2));
  const fit = Math.min(640, Math.max(360, boundsHeight - margin * 2));
  let left = boundsWidth - margin - width;
  let top = margin;
  let fromY = -10;
  let origin: Slot["origin"] = "top right";
  if (anchor) {
    left = anchor.x + anchor.width - originX - width;
    top = anchor.y + anchor.height - originY + 8;
  }
  if (left < margin) left = margin;
  if (left + width > boundsWidth - margin) left = Math.max(margin, boundsWidth - margin - width);
  const maxTop = Math.max(margin, boundsHeight - margin - fit);
  if (top > maxTop) {
    top = maxTop;
    fromY = 10;
    origin = "bottom right";
  }
  if (top < margin) top = margin;
  return { top, left, width, fromY, origin };
}

function phaseRows(chips: LifeChip[]) {
  const you = chips.filter((chip) => chip.side === "you").length;
  const them = chips.filter((chip) => chip.side === "them").length;
  return Math.max(you, them);
}

export function WeiIntroSheet({ rec, onClose }: Props) {
  const { api } = useSession();
  const { width, height, isCompact, phonePreview } = useResponsive();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const mobile = isCompact || phonePreview;
  const [mineProfile, setMineProfile] = useState<GoldProfile | null>(null);
  const [mineReady, setMineReady] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const shell = useRef(new Animated.Value(0)).current;
  const steadyLayer = useRef(new Animated.Value(1)).current;
  const latelyLayer = useRef(new Animated.Value(0)).current;
  const highlight = useRef(new Animated.Value(0)).current;
  const take = useRef(new Animated.Value(0)).current;
  const chipAnims = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;
  const expand = useRef(new Animated.Value(0)).current;
  const overlayRef = useRef<View>(null);
  const closing = useRef(false);
  const played = useRef("");
  const seenKey = useRef("");

  const recKey = rec ? String(rec.id) : "";
  if (seenKey.current !== recKey) {
    seenKey.current = recKey;
    setExpanded(false);
    if (slot) setSlot(null);
  }

  useEffect(() => {
    if (!rec) return;
    let active = true;
    setMineProfile(null);
    setMineReady(false);
    setExpanded(false);
    api
      .request<{ gold_profile: GoldProfile | null }>("/profile/life-index")
      .then((result) => {
        if (!active) return;
        setMineProfile(result.gold_profile);
        setMineReady(true);
      })
      .catch(() => {
        if (!active) return;
        setMineProfile(null);
        setMineReady(true);
      });
    return () => {
      active = false;
    };
  }, [api, rec]);

  const ready = mobile || Boolean(slot);

  const placeFromOverlay = (layoutWidth: number, layoutHeight: number) => {
    if (!rec || mobile) return;
    const apply = (originX: number, originY: number, boundsWidth: number, boundsHeight: number) => {
      if (boundsWidth < 32 || boundsHeight < 32) return;
      const next = placeCard(pendingAnchor, originX, originY, boundsWidth, boundsHeight);
      setSlot((current) => {
        if (
          current &&
          current.top === next.top &&
          current.left === next.left &&
          current.width === next.width &&
          current.origin === next.origin
        ) {
          return current;
        }
        return next;
      });
    };
    const node = overlayRef.current;
    if (!node?.measureInWindow) {
      apply(0, 0, layoutWidth, layoutHeight);
      return;
    }
    node.measureInWindow((originX, originY, boundsWidth, boundsHeight) => {
      apply(originX, originY, boundsWidth > 32 ? boundsWidth : layoutWidth, boundsHeight > 32 ? boundsHeight : layoutHeight);
    });
  };

  useEffect(() => {
    if (!rec) {
      played.current = "";
      return;
    }
    if (!ready) return;
    if (played.current === recKey && !reduced) return;
    played.current = recKey;
    closing.current = false;
    if (reduced || noaBriefSeen(recKey)) {
      if (reduced) {
        shell.setValue(1);
        return;
      }
      shell.setValue(0);
      Animated.timing(shell, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
      return;
    }
    shell.setValue(0);
    Animated.spring(shell, {
      toValue: 1,
      friction: 9,
      tension: 68,
      useNativeDriver: true,
    }).start();
  }, [ready, rec, recKey, reduced, shell]);

  const mine = useMemo(() => lifeIndexBuckets(mineProfile), [mineProfile]);
  const theirs = useMemo(() => lifeIndexBuckets(rec?.candidate_context?.gold_profile), [rec]);
  const reading = useMemo(
    () =>
      readLifeIndexes({
        mine: mineProfile,
        theirs: rec?.candidate_context?.gold_profile,
        mineReady,
      }),
    [mineProfile, mineReady, rec],
  );
  const sharedKeys = useMemo(() => new Set(reading.shared.map(lifeIndexKey)), [reading.shared]);
  const chipKey = reading.chips.map((chip) => `${chip.id}:${chip.shared ? 1 : 0}`).join("|");
  const steadySeq = useMemo(() => sequenceFor(reading.chips, "steady"), [reading.chips]);
  const latelySeq = useMemo(() => sequenceFor(reading.chips, "lately"), [reading.chips]);

  useEffect(() => {
    if (!rec || !mineReady || !ready) {
      chipAnims.forEach((value) => value.setValue(0));
      steadyLayer.setValue(1);
      latelyLayer.setValue(0);
      highlight.setValue(0);
      take.setValue(0);
      return;
    }
    const hasSteady = steadySeq.length > 0;
    const hasLately = latelySeq.length > 0;
    const showEnd = () => {
      chipAnims.forEach((value) => value.setValue(1));
      steadyLayer.setValue(hasSteady && !hasLately ? 1 : 0);
      latelyLayer.setValue(hasLately ? 1 : 0);
      if (!hasSteady && !hasLately) steadyLayer.setValue(1);
      highlight.setValue(1);
      take.setValue(1);
    };
    if (reduced || noaBriefSeen(recKey)) {
      showEnd();
      return;
    }
    chipAnims.forEach((value) => value.setValue(0));
    highlight.setValue(0);
    take.setValue(0);
    steadyLayer.setValue(hasSteady ? 1 : 0);
    latelyLayer.setValue(hasSteady ? 0 : 1);
    if (hasSteady && hasLately) latelySeq.forEach((_, index) => chipAnims[6 + index].setValue(1));
    const primary = hasSteady ? steadySeq : latelySeq;
    const steps: Animated.CompositeAnimation[] = [];
    if (primary.length) {
      steps.push(
        Animated.stagger(
          100,
          primary.map((_, index) =>
            Animated.spring(chipAnims[index], {
              toValue: 1,
              friction: 8,
              tension: 62,
              useNativeDriver: true,
            }),
          ),
        ),
      );
    }
    const highlightStep = Animated.timing(highlight, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    const crossfade =
      hasSteady && hasLately
        ? Animated.parallel([
            Animated.timing(steadyLayer, {
              toValue: 0,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
            Animated.timing(latelyLayer, {
              toValue: 1,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ])
        : null;
    const sharedOnSteady = steadySeq.some((chip) => chip.shared);
    const sharedOnLately = latelySeq.some((chip) => chip.shared);
    if (crossfade && sharedOnLately && !sharedOnSteady) {
      steps.push(crossfade, highlightStep);
    } else {
      steps.push(highlightStep);
      if (crossfade) steps.push(crossfade);
    }
    steps.push(
      Animated.timing(take, {
        toValue: 1,
        duration: 280,
        delay: 70,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    );
    const animation = Animated.sequence(steps);
    animation.start();
    return () => animation.stop();
  }, [chipAnims, chipKey, highlight, latelyLayer, latelySeq, mineReady, ready, rec, recKey, reduced, steadyLayer, steadySeq, take]);

  useEffect(() => {
    Animated.timing(expand, {
      toValue: expanded ? 1 : 0,
      duration: reduced ? 0 : 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [expand, expanded, reduced]);

  const name = rec ? personName(rec.candidate) : "";
  const groups = [
    { key: "steady", label: "Steady", mine: mine.steady, theirs: theirs.steady },
    { key: "lately", label: "Lately", mine: mine.lately, theirs: theirs.lately },
    { key: "skip", label: "Skip", mine: mine.skip, theirs: theirs.skip },
  ].filter((group) => group.mine.length > 0 || group.theirs.length > 0);

  if (!rec) return null;

  const stageRows = Math.max(
    phaseRows(reading.chips.filter((chip) => chip.bucket === "steady")),
    phaseRows(reading.chips.filter((chip) => chip.bucket === "lately")),
  );
  const stageHeight = stageRows > 0 ? stageRows * 36 + (stageRows - 1) * 8 : 0;
  const scrollMax = mobile
    ? Math.max(360, height - Math.max(insets.top, 12) - 24)
    : Math.max(360, height - (slot?.top ?? 16) - 16);

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    const key = recKey;
    if (reduced) {
      played.current = "";
      if (recKey) markNoaBriefSeen(recKey);
      onClose();
      return;
    }
    Animated.timing(shell, {
      toValue: 0,
      duration: 180,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      closing.current = false;
      if (finished && played.current === key) {
        played.current = "";
        if (key) markNoaBriefSeen(key);
        onClose();
      }
    });
  };

  const fromY = mobile ? 28 : slot?.fromY ?? -10;
  const shellStyle = {
    opacity: shell,
    transform: [
      {
        translateY: shell.interpolate({
          inputRange: [0, 1],
          outputRange: [reduced ? 0 : fromY, 0],
        }),
      },
      {
        scale: shell.interpolate({
          inputRange: [0, 1],
          outputRange: [reduced ? 1 : mobile ? 0.98 : 0.94, 1],
        }),
      },
    ],
  };

  const card = (
    <Animated.View
      style={[
        styles.shadow,
        mobile ? styles.sheet : [styles.popover, slot ? { top: slot.top, left: slot.left, width: slot.width } : styles.popoverPending],
        shellStyle,
        Platform.OS === "web" ? { transformOrigin: mobile ? "bottom center" : slot?.origin || "top right" } : null,
      ]}
    >
      <View style={[styles.card, mobile ? styles.sheetFace : styles.popoverFace]}>
        {mobile ? <View style={styles.handle} /> : null}
        <ScrollView
          bounces={false}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={{ maxHeight: scrollMax }}
          contentContainerStyle={[styles.body, mobile && { paddingBottom: Math.max(insets.bottom, 12) + spacing.md }]}
        >
          <View style={styles.header}>
            <WeaveGuide size={36} />
            <View style={styles.identity}>
              <Text variant="heading">{WEAVE_GUIDE.name}</Text>
              <Text variant="small" muted numberOfLines={1}>
                {name}
              </Text>
            </View>
            <Pressable accessibilityRole="button" onPress={close} hitSlop={10}>
              <Text variant="small" muted>
                Close
              </Text>
            </Pressable>
          </View>

          {mineReady ? (
            <View style={styles.discovery}>
              <View style={styles.phaseRow}>
                <Text variant="small" muted style={styles.kicker}>
                  Life index
                </Text>
                <View style={styles.phaseSlot}>
                  <Animated.View style={{ opacity: steadyLayer }}>
                    <Text variant="small" style={styles.phaseLabel}>
                      Steady
                    </Text>
                  </Animated.View>
                  {latelySeq.length ? (
                    <Animated.View style={[styles.phaseFloat, { opacity: latelyLayer }]}>
                      <Text variant="small" style={styles.phaseLabel}>
                        Lately
                      </Text>
                    </Animated.View>
                  ) : null}
                </View>
              </View>
              <View style={styles.stage}>
                {steadySeq.length || latelySeq.length ? (
                  <>
                    <View style={styles.compareHead}>
                      <Text variant="small" muted style={styles.sideLabel}>
                        You
                      </Text>
                      <Text variant="small" muted style={[styles.sideLabel, styles.sideLabelRight]}>
                        Them
                      </Text>
                    </View>
                    <View style={[styles.stageBody, { height: stageHeight }]}>
                      <Animated.View style={[styles.phaseLayer, { opacity: steadyLayer }]} pointerEvents="none">
                        <CompareColumns
                          chips={reading.chips.filter((chip) => chip.bucket === "steady")}
                          animFor={(id) => {
                            const index = steadySeq.findIndex((chip) => chip.id === id);
                            return index >= 0 ? chipAnims[index] : undefined;
                          }}
                          highlight={highlight}
                          reduced={reduced || noaBriefSeen(recKey)}
                        />
                      </Animated.View>
                      <Animated.View style={[styles.phaseLayer, { opacity: latelyLayer }]} pointerEvents="none">
                        <CompareColumns
                          chips={reading.chips.filter((chip) => chip.bucket === "lately")}
                          animFor={(id) => {
                            const index = latelySeq.findIndex((chip) => chip.id === id);
                            if (index < 0) return undefined;
                            return chipAnims[(steadySeq.length ? 6 : 0) + index];
                          }}
                          highlight={highlight}
                          reduced={reduced || noaBriefSeen(recKey)}
                        />
                      </Animated.View>
                    </View>
                  </>
                ) : null}
                {reading.shared.length || reading.related.length ? (
                  <Animated.View style={[styles.connectionSlot, { opacity: highlight }]}>
                    {reading.shared.length ? (
                      <View style={styles.sharedMark}>
                        <View style={styles.sharedRule} />
                        <Text variant="small" style={styles.sharedLabel}>
                          A shared interest
                        </Text>
                        <View style={styles.sharedRule} />
                      </View>
                    ) : (
                      <Text variant="small" muted style={styles.relatedLabel}>
                        Nearby in {reading.related[0].name}
                      </Text>
                    )}
                  </Animated.View>
                ) : null}
              </View>
            </View>
          ) : null}

          {mineReady && reading.take ? (
            <Animated.View style={riseStyle(take)}>
              <View style={styles.bubble}>
                <View style={styles.tail} />
                <Text variant="body" style={styles.bubbleText}>
                  {reading.take}
                </Text>
              </View>
            </Animated.View>
          ) : null}

          <View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                onPress={() => setExpanded((open) => !open)}
                style={styles.explore}
              >
                <Text variant="small" style={styles.exploreLabel}>
                  Explore both life indexes
                </Text>
                <Text variant="small" muted>
                  {expanded ? "Hide" : "Show"}
                </Text>
              </Pressable>
              <Animated.View
                pointerEvents={expanded ? "auto" : "none"}
                style={{
                  opacity: expand,
                  maxHeight: expand.interpolate({ inputRange: [0, 1], outputRange: [0, 1200] }),
                  overflow: "hidden",
                }}
              >
                <View style={styles.index}>
                  <View style={styles.columns}>
                    <Text variant="small" muted style={styles.columnLabel}>
                      You
                    </Text>
                    <Text variant="small" muted style={styles.columnLabel}>
                      Them
                    </Text>
                  </View>
                  {groups.length ? (
                    groups.map((group) => (
                      <View key={group.key} style={styles.group}>
                        <Text variant="small" muted style={styles.groupLabel}>
                          {group.label}
                        </Text>
                        <View style={styles.columns}>
                          <TagWrap tags={group.mine} shared={sharedKeys} muted={group.key === "skip"} />
                          <TagWrap tags={group.theirs} shared={sharedKeys} muted={group.key === "skip"} />
                        </View>
                      </View>
                    ))
                  ) : (
                    <Text variant="small" muted>
                      There isn't enough in either life index yet.
                    </Text>
                  )}
                </View>
              </Animated.View>
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );

  const overlay = (
    <View
      ref={overlayRef}
      collapsable={false}
      onLayout={(event) => placeFromOverlay(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
      style={[styles.overlay, Platform.OS === "web" && phonePreview ? { width, height } : undefined]}
    >
      <Pressable accessibilityLabel="Close Noa" accessibilityRole="button" onPress={close} style={styles.scrim} />
      {mobile || slot ? card : null}
    </View>
  );

  if (Platform.OS === "web") return overlay;

  return (
    <Modal animationType="none" onRequestClose={close} transparent visible>
      {overlay}
    </Modal>
  );
}

function CompareColumns({
  chips,
  animFor,
  highlight,
  reduced,
}: {
  chips: LifeChip[];
  animFor: (id: string) => Animated.Value | undefined;
  highlight: Animated.Value;
  reduced: boolean;
}) {
  const you = chips.filter((chip) => chip.side === "you");
  const them = chips.filter((chip) => chip.side === "them");
  if (!you.length && !them.length) return null;
  return (
    <View style={styles.compare}>
      <View style={styles.side}>
        {you.map((chip) => (
          <PopChip key={chip.id} chip={chip} anim={animFor(chip.id)} highlight={highlight} reduced={reduced} />
        ))}
      </View>
      <View style={[styles.side, styles.sideEnd]}>
        {them.map((chip) => (
          <PopChip key={chip.id} chip={chip} anim={animFor(chip.id)} highlight={highlight} reduced={reduced} />
        ))}
      </View>
    </View>
  );
}

function PopChip({
  chip,
  anim,
  highlight,
  reduced,
}: {
  chip: LifeChip;
  anim?: Animated.Value;
  highlight: Animated.Value;
  reduced: boolean;
}) {
  const enter = reduced || !anim ? null : anim;
  const motion = enter
    ? {
        opacity: enter,
        transform: [
          { translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
          {
            scale: Animated.multiply(
              enter.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
              highlight.interpolate({ inputRange: [0, 1], outputRange: [1, chip.shared ? 1.04 : 1] }),
            ),
          },
        ],
      }
    : undefined;
  return (
    <Animated.View style={[styles.tag, chip.side === "them" && styles.tagEnd, motion]}>
      {chip.shared ? <Animated.View pointerEvents="none" style={[styles.tagWash, { opacity: reduced ? 1 : highlight }]} /> : null}
      <Text variant="small" style={styles.tagText}>
        {chip.label}
      </Text>
    </Animated.View>
  );
}

function TagWrap({ tags, shared, muted = false }: { tags: string[]; shared: Set<string>; muted?: boolean }) {
  if (!tags.length) {
    return (
      <View style={styles.tags}>
        <Text variant="small" muted>
          —
        </Text>
      </View>
    );
  }
  return (
    <View style={styles.tags}>
      {tags.map((tag) => {
        const hit = !muted && shared.has(lifeIndexKey(tag));
        return (
          <View key={`${muted ? "skip" : "keep"}-${lifeIndexKey(tag)}`} style={[styles.tag, hit && styles.tagShared, muted && styles.tagMuted]}>
            <Text variant="small" style={[styles.tagText, muted && styles.tagTextMuted, hit && styles.tagTextShared]}>
              {tag}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2000,
    justifyContent: "flex-end",
  },
  scrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.12)",
  },
  shadow: {
    ...Platform.select({
      web: { boxShadow: "0 12px 40px rgba(0,0,0,0.08)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.08,
        shadowRadius: 40,
        elevation: 12,
      },
    }),
  },
  card: {
    backgroundColor: SHEET_BG,
    borderWidth: 1,
    borderColor: SHEET_LINE,
    overflow: "hidden",
  },
  sheet: {
    width: "100%",
  },
  sheetFace: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  popover: {
    position: "absolute",
    maxWidth: 440,
  },
  popoverPending: {
    top: 16,
    right: 16,
    width: 440,
  },
  popoverFace: {
    borderRadius: 24,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    marginTop: 8,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  identity: {
    flex: 1,
    minWidth: 0,
  },
  bubble: {
    alignSelf: "flex-start",
    maxWidth: "100%",
    marginTop: 6,
    backgroundColor: colors.bg,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: SHEET_LINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  tail: {
    position: "absolute",
    left: 16,
    top: -5,
    width: 9,
    height: 9,
    backgroundColor: colors.bg,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: SHEET_LINE,
    transform: [{ rotate: "45deg" }],
  },
  bubbleText: {
    lineHeight: 22,
  },
  reveal: {
    gap: spacing.sm,
  },
  discovery: {
    gap: spacing.sm,
    paddingTop: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SHEET_LINE,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kicker: {
    letterSpacing: 0.3,
  },
  phaseSlot: {
    minWidth: 64,
    minHeight: 18,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  phaseFloat: {
    position: "absolute",
    right: 0,
    top: 0,
  },
  phaseLabel: {
    fontWeight: "600",
  },
  stage: {
    gap: 4,
  },
  compareHead: {
    flexDirection: "row",
    gap: spacing.md,
  },
  sideLabel: {
    flex: 1,
    minWidth: 0,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  sideLabelRight: {
    textAlign: "right",
  },
  stageBody: {
    position: "relative",
  },
  sideEnd: {
    alignItems: "flex-end",
  },
  phaseLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
  },
  compare: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  side: {
    flex: 1,
    minWidth: 0,
    gap: 8,
  },
  connectionSlot: {
    justifyContent: "center",
  },
  sharedMark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sharedRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.accent,
    opacity: 0.45,
  },
  sharedLabel: {
    color: colors.accentMuted,
    fontWeight: "600",
  },
  relatedLabel: {
    textAlign: "center",
  },
  tags: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tagEnd: {
    alignSelf: "flex-end",
  },
  tag: {
    maxWidth: "100%",
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    backgroundColor: "#FFFdfb",
    borderWidth: 1,
    borderColor: "#E6E2DA",
    paddingHorizontal: 10,
    paddingVertical: 6,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 1px 2px rgba(0,0,0,0.04)" },
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 2,
        elevation: 1,
      },
    }),
  },
  tagWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(61, 220, 132, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(61, 220, 132, 0.5)",
    borderRadius: radius.pill,
  },
  tagShared: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  tagMuted: {
    backgroundColor: "transparent",
  },
  tagText: {
    flexShrink: 1,
    color: colors.ink,
  },
  tagTextMuted: {
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  tagTextShared: {
    color: colors.accentMuted,
  },
  explore: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: 4,
  },
  exploreLabel: {
    flex: 1,
    fontWeight: "600",
  },
  index: {
    gap: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SHEET_LINE,
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  columnLabel: {
    flex: 1,
    fontWeight: "600",
  },
  group: {
    gap: 8,
  },
  groupLabel: {
    letterSpacing: 0.4,
  },
});
