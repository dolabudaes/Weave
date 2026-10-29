import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { WeaveLogo } from "@/components/social/WeaveLogo";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { useResponsive } from "@/hooks/useResponsive";
import { usePageLayout } from "@/theme/pageStyles";
import { colors, radius, spacing } from "@/theme/tokens";

export default function OnboardingScreen() {
  const { refreshMe } = useSession();
  const page = usePageLayout();
  const { pagePadding } = useResponsive();

  const finish = async () => {
    await refreshMe();
    router.replace("/home");
  };

  return (
    <ScrollView contentContainerStyle={[styles.wrapper, { padding: pagePadding }]} style={page.scroll}>
      <View style={styles.panel}>
        <WeaveLogo size="large" />
        <Text variant="title" style={styles.title}>
          Your signal starts here
        </Text>
        <Text muted style={styles.copy}>
          Share what matters now. Weave matches you when the signal goes both ways.
        </Text>
        <Pressable onPress={finish} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
          <Text variant="label" style={styles.ctaText}>
            Enter
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: spacing.xxl,
  },
  panel: {
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    gap: spacing.lg,
  },
  title: {
    textAlign: "center",
    letterSpacing: -0.2,
  },
  copy: {
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 320,
  },
  cta: {
    marginTop: spacing.lg,
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    paddingHorizontal: spacing.xxl,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  ctaText: {
    color: colors.onAccent,
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.72,
  },
});
