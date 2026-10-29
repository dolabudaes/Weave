import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppPreviewShell } from "@/components/layout/AppPreviewShell";
import { PreviewModeProvider } from "@/features/preview/PreviewModeContext";
import { SessionProvider } from "@/features/auth/session";
import { colors } from "@/theme/tokens";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <PreviewModeProvider>
        <SessionProvider>
          <View style={styles.root}>
            <StatusBar style="dark" />
            <AppPreviewShell>
              <Stack screenOptions={{ headerShown: false }} />
            </AppPreviewShell>
          </View>
        </SessionProvider>
      </PreviewModeProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: Platform.OS === "web" ? colors.canvas : colors.bg,
    ...(Platform.OS === "web" ? ({ height: "100%" } as const) : {}),
  },
});
