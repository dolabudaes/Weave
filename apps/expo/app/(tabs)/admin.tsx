import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { Text } from "@/components/ui/Text";
import { recommendationReason } from "@/components/social/profileDisplay";
import { useSession } from "@/features/auth/session";
import { usePageLayout } from "@/theme/pageStyles";
import { colors, radius, spacing } from "@/theme/tokens";
import type { AdminAiJob, AdminReport, Recommendation, WeaveUser } from "@/types/weave";

export default function AdminScreen() {
  const page = usePageLayout();
  const { api, user } = useSession();
  const [metrics, setMetrics] = React.useState<Record<string, string | number>>({});
  const [users, setUsers] = React.useState<WeaveUser[]>([]);
  const [reports, setReports] = React.useState<AdminReport[]>([]);
  const [recommendations, setRecommendations] = React.useState<Recommendation[]>([]);
  const [jobs, setJobs] = React.useState<AdminAiJob[]>([]);
  const [error, setError] = React.useState("");

  const load = React.useCallback(async () => {
    setError("");
    try {
      const [nextMetrics, nextUsers, nextReports, nextRecommendations, nextJobs] = await Promise.all([
        api.request<Record<string, string | number>>("/admin/metrics"),
        api.request<WeaveUser[]>("/admin/users"),
        api.request<AdminReport[]>("/admin/reports"),
        api.request<Recommendation[]>("/admin/recommendations"),
        api.request<AdminAiJob[]>("/admin/ai-jobs"),
      ]);
      setMetrics(nextMetrics);
      setUsers(nextUsers);
      setReports(nextReports);
      setRecommendations(nextRecommendations);
      setJobs(nextJobs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load admin data");
    }
  }, [api]);

  React.useEffect(() => {
    load();
  }, [load]);

  if (user?.role !== "admin") {
    return (
      <ScrollView contentContainerStyle={[page.shell, page.tabPadding, styles.content]} style={page.scroll}>
        <Text variant="title">Admin</Text>
        <Card title="Access denied">
          <Text muted>Admin access required.</Text>
        </Card>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={[page.shell, page.tabPadding, styles.content]} style={page.scroll}>
      <View style={styles.header}>
        <View>
          <Text variant="small" subtle>Internal view</Text>
          <Text variant="title">Admin</Text>
        </View>
        <Button onPress={load}>Refresh</Button>
      </View>
      {error ? <View style={styles.error}><Ionicons color={colors.warning} name="alert-circle-outline" size={18} /><Text>{error}</Text></View> : null}
      <View style={styles.metrics}>
        {Object.entries(metrics).map(([label, value]) => (
          <View key={label} style={styles.metric}>
            <Text variant="heading">{String(value)}</Text>
            <Text variant="small" muted>{label}</Text>
          </View>
        ))}
      </View>
      <Card title="Users">
        {users.map((item) => (
          <View key={item.id} style={styles.rowItem}>
            <View style={styles.rowHeader}>
              <Text>{item.email}</Text>
              <Pill tone="outline">{item.role}</Pill>
            </View>
            <Text muted>#{item.id} · {item.username} · {item.status} · {item.is_test_account ? "Test account" : "Real user"}</Text>
          </View>
        ))}
      </Card>
      <Card title="Recommendations">
        {recommendations.map((item) => (
          <View key={item.id} style={styles.rowItem}>
            <Text>#{item.id} · {item.status || "pending"}</Text>
            <Text muted>{recommendationReason(item)}</Text>
          </View>
        ))}
      </Card>
      <Card title="Reports">
        {reports.map((item) => (
          <View key={item.id} style={styles.rowItem}>
            <View style={styles.rowHeader}>
              <Text>#{item.id} · {item.category}</Text>
              <Pill tone="outline">{item.status}</Pill>
            </View>
            <Text muted>{item.description || "No description"}</Text>
          </View>
        ))}
      </Card>
      <Card title="AI jobs">
        {jobs.map((item, index) => (
          <View key={`${item.provider}-${index}`} style={styles.rowItem}>
            <View style={styles.rowHeader}>
              <Text>{item.provider}</Text>
              <Pill tone="outline">{item.status}</Pill>
            </View>
            <Text muted>{item.model || "No model recorded"} · {item.failed_reason || "No failure"}</Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingTop: spacing.lg,
  },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  metric: {
    width: "48%",
    borderRadius: radius.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  rowItem: {
    gap: spacing.xs,
    marginTop: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.soft,
    padding: spacing.md,
  },
  rowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  error: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    borderRadius: radius.md,
    backgroundColor: colors.dangerBg,
    padding: spacing.md,
  },
});
