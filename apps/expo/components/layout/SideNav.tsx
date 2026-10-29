import { Pressable, StyleSheet, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/ui/Text";
import { useResponsive } from "@/hooks/useResponsive";
import { colors, spacing } from "@/theme/tokens";

type NavItem = {
  href: "/home" | "/ai" | "/connections" | "/profile" | "/admin";
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconFocused: keyof typeof Ionicons.glyphMap;
  adminOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/home", label: "Home", icon: "home-outline", iconFocused: "home" },
  { href: "/ai", label: "Noa", icon: "sparkles-outline", iconFocused: "sparkles" },
  { href: "/connections", label: "Messages", icon: "paper-plane-outline", iconFocused: "paper-plane" },
  { href: "/profile", label: "You", icon: "person-outline", iconFocused: "person" },
  { href: "/admin", label: "Admin", icon: "menu-outline", iconFocused: "menu", adminOnly: true },
];

type Props = {
  isAdmin: boolean;
};

export function SideNav({ isAdmin }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { sidebarWidth } = useResponsive();

  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <View style={[styles.sidebar, { width: sidebarWidth }]}>
      <View style={styles.brand}>
        <Text variant="title">Weave</Text>
      </View>

      <View style={styles.nav}>
        {NAV.filter((item) => !item.adminOnly || isAdmin).map((item) => {
          const focused = active(item.href);
          return (
            <Pressable
              key={item.href}
              onPress={() => router.push(item.href as never)}
              style={({ pressed }) => [styles.navItem, focused && styles.navItemActive, pressed && styles.pressed]}
            >
              <Ionicons color={focused ? colors.ink : colors.muted} name={focused ? item.iconFocused : item.icon} size={24} />
              <Text variant="heading" style={focused ? styles.navLabelActive : styles.navLabel}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
  },
  brand: {
    paddingBottom: spacing.xl,
  },
  nav: {
    gap: spacing.xs,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  navItemActive: {
    backgroundColor: colors.soft,
  },
  navLabel: {
    color: colors.muted,
    fontWeight: "400",
  },
  navLabelActive: {
    fontWeight: "700",
  },
  pressed: {
    opacity: 0.6,
  },
});
