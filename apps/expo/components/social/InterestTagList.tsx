import { StyleSheet, View } from "react-native";
import { spacing } from "@/theme/tokens";
import { InterestChip } from "./InterestChip";

type Props = {
  tags: string[];
  limit?: number;
};

export function InterestTagList({ tags, limit = 10 }: Props) {
  return (
    <View style={styles.wrap}>
      {tags.slice(0, limit).map((tag) => (
        <InterestChip key={tag} label={tag} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
});
