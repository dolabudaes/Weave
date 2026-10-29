import React from "react";

export type PreviewLayoutMetrics = {
  width: number;
  height: number;
};

type PreviewModeContextValue = {
  phonePreview: boolean;
  setPhonePreview: (value: boolean) => void;
  togglePhonePreview: () => void;
};

const PreviewModeContext = React.createContext<PreviewModeContextValue | null>(null);
const PreviewMetricsContext = React.createContext<PreviewLayoutMetrics | null>(null);

export function PreviewModeProvider({ children }: { children: React.ReactNode }) {
  const [phonePreview, setPhonePreview] = React.useState(false);
  const togglePhonePreview = React.useCallback(() => setPhonePreview((v) => !v), []);

  const value = React.useMemo(
    () => ({ phonePreview, setPhonePreview, togglePhonePreview }),
    [phonePreview, togglePhonePreview],
  );

  return <PreviewModeContext.Provider value={value}>{children}</PreviewModeContext.Provider>;
}

export function PreviewMetricsProvider({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  const value = React.useMemo(() => ({ width, height }), [width, height]);
  return <PreviewMetricsContext.Provider value={value}>{children}</PreviewMetricsContext.Provider>;
}

export function usePreviewMode() {
  const ctx = React.useContext(PreviewModeContext);
  if (!ctx) throw new Error("usePreviewMode must be used within PreviewModeProvider");
  return ctx;
}

export function usePreviewModeOptional() {
  return React.useContext(PreviewModeContext);
}

export function usePreviewMetricsOptional() {
  return React.useContext(PreviewMetricsContext);
}
