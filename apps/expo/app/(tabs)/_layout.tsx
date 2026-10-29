import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SideNav } from "@/components/layout/SideNav";
import { useResponsive } from "@/hooks/useResponsive";
import { useSession } from "@/features/auth/session";
import { compactTabBarStyle, hiddenTabBarStyle } from "@/theme/tabBar";
import { colors } from "@/theme/tokens";

export default function TabsLayout() {
  const { loading, session, user } = useSession();
  const { isWide } = useResponsive();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  if (!session) return <Redirect href="/login" />;
  if (!user?.profile?.onboarding_completed) return <Redirect href="/onboarding" />;

  return (
    <View style={[styles.root, isWide && styles.rootWide]}>
      {isWide ? <SideNav isAdmin={user.role === "admin"} /> : null}
      <View style={styles.main}>
        <Tabs
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: colors.ink,
            tabBarInactiveTintColor: colors.subtle,
            tabBarShowLabel: false,
            tabBarStyle: isWide ? hiddenTabBarStyle : compactTabBarStyle,
            tabBarHideOnKeyboard: true,
          }}
        >
          <Tabs.Screen
            name="home"
            options={{
              title: "Home",
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons color={color} name={focused ? "home" : "home-outline"} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="ai"
            options={{
              title: "Noa",
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons color={color} name={focused ? "sparkles" : "sparkles-outline"} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="discover"
            options={{
              href: null,
              title: "Discover",
            }}
          />
          <Tabs.Screen
            name="connections"
            options={{
              title: "Messages",
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons color={color} name={focused ? "paper-plane" : "paper-plane-outline"} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="profile"
            options={{
              title: "You",
              tabBarIcon: ({ color, size, focused }) => (
                <Ionicons color={color} name={focused ? "person" : "person-outline"} size={size} />
              ),
            }}
          />
          <Tabs.Screen
            name="admin"
            options={{
              href: user.role === "admin" ? "/admin" : null,
              title: "Admin",
              tabBarIcon: ({ color, size }) => <Ionicons color={color} name="menu-outline" size={size} />,
            }}
          />
        </Tabs>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  rootWide: {
    flexDirection: "row",
    backgroundColor: colors.canvas,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: colors.bg,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
  },
  tabBarHidden: {
    display: "none",
  },
});
