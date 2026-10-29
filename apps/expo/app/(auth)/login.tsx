import React from "react";
import { router } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { WeaveLogo } from "@/components/social/WeaveLogo";
import { Text } from "@/components/ui/Text";
import { useSession } from "@/features/auth/session";
import { useResponsive } from "@/hooks/useResponsive";
import { API_BASE_URL } from "@/services/api/client";
import { colors, fonts, radius, spacing } from "@/theme/tokens";
import type { Session } from "@/types/weave";

export default function LoginScreen() {
  const { saveSession } = useSession();
  const { pagePadding } = useResponsive();
  const [mode, setMode] = React.useState<"login" | "register">("login");
  const [email, setEmail] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");

  const submit = async () => {
    setError("");
    try {
      const body = mode === "login" ? { email, password } : { email, username, password };
      const res = await fetch(`${API_BASE_URL}/auth/${mode}`, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Couldn't sign in");
      await saveSession(data as Session);
      router.replace("/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't sign in");
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.page}>
      <ScrollView
        contentContainerStyle={[styles.wrapper, { paddingHorizontal: pagePadding }]}
        keyboardShouldPersistTaps="handled"
        style={styles.page}
      >
        <View style={styles.hero}>
          <WeaveLogo size="large" />
          <Text variant="small" muted style={styles.tagline}>
            The right people show up in the right signal.
          </Text>
        </View>

        <View style={styles.form}>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.subtle}
            style={styles.input}
            value={email}
          />
          {mode === "register" ? (
            <TextInput
              autoCapitalize="none"
              onChangeText={setUsername}
              placeholder="Username"
              placeholderTextColor={colors.subtle}
              style={styles.input}
              value={username}
            />
          ) : null}
          <TextInput
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.subtle}
            secureTextEntry
            style={styles.input}
            value={password}
          />

          {error ? (
            <Text variant="small" style={styles.error}>
              {error}
            </Text>
          ) : null}

          <Pressable onPress={submit} style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text variant="label" style={styles.ctaText}>
              {mode === "login" ? "Continue" : "Create account"}
            </Text>
          </Pressable>

          <Pressable onPress={() => setMode(mode === "login" ? "register" : "login")} style={({ pressed }) => [styles.switch, pressed && styles.pressed]}>
            <Text variant="small" style={styles.switchText}>
              {mode === "login" ? "New here? Sign up" : "Already have an account"}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  wrapper: {
    flexGrow: 1,
    justifyContent: "center",
    maxWidth: 380,
    width: "100%",
    alignSelf: "center",
    gap: spacing.xxl,
    paddingVertical: spacing.xxl,
  },
  hero: {
    alignItems: "center",
    gap: spacing.lg,
  },
  tagline: {
    textAlign: "center",
    letterSpacing: 0.3,
    maxWidth: 280,
  },
  form: {
    gap: spacing.lg,
  },
  input: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.lineStrong,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
    paddingVertical: spacing.md,
    paddingHorizontal: 0,
  },
  error: {
    color: colors.warning,
  },
  cta: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  ctaText: {
    color: colors.onAccent,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  switch: {
    alignItems: "center",
    paddingVertical: spacing.sm,
  },
  switchText: {
    color: colors.muted,
  },
  pressed: {
    opacity: 0.72,
  },
});
