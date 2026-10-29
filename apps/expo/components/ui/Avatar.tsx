import { Image, StyleSheet, View } from "react-native";
import { colors } from "@/theme/tokens";
import { Text } from "./Text";

type Props = {
  name?: string;
  imageUrl?: string;
  size?: number;
  ring?: boolean;
};

export function Avatar({ name = "W", imageUrl, size = 48, ring = false }: Props) {
  const initial = (name.trim()[0] || "W").toUpperCase();
  const inner = ring ? size - 6 : size;
  return (
    <View style={[ring && styles.ring, ring && { width: size, height: size, borderRadius: size / 2 }]}>
      <View
        style={[
          styles.avatar,
          {
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          },
        ]}
      >
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={{ width: inner, height: inner, borderRadius: inner / 2 }} />
        ) : (
          <Text variant="label" style={styles.initial}>
            {initial}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: {
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
    borderWidth: 2,
    borderColor: colors.storyRing,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.soft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  initial: {
    color: colors.ink,
    fontWeight: "500",
  },
});
