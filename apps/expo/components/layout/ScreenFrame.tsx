import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { usePageLayout } from "@/theme/pageStyles";
import { colors, spacing } from "@/theme/tokens";

type Props = {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
};

export function ScreenFrame({ children, header, footer, scroll = true, contentStyle }: Props) {
  const page = usePageLayout();
  const pad = { paddingHorizontal: page.pagePadding };

  return (
    <View style={[styles.root, page.phonePreview && styles.phoneRoot]}>
      {header ? <View style={[styles.header, pad]}>{header}</View> : null}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, pad, { paddingBottom: footer ? spacing.md : page.bottomInset }, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.body, pad, contentStyle]}>{children}</View>
      )}
      {footer ? <View style={[styles.footer, pad, { paddingBottom: page.bottomInset }]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    backgroundColor: colors.bg,
  },
  phoneRoot: {
    overflow: "hidden",
  },
  header: {
    flexShrink: 0,
    backgroundColor: colors.bg,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    flexGrow: 1,
  },
  footer: {
    flexShrink: 0,
    backgroundColor: colors.bg,
  },
});
