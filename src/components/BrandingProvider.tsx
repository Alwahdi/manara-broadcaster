import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchActiveTheme, applyThemeToDocument } from "@/lib/themes";

/** Applies the active theme's brand colors + name to <html> on mount. */
export function BrandingProvider({ children }: { children: React.ReactNode }) {
  const { data: theme } = useQuery({
    queryKey: ["active-theme"],
    queryFn: fetchActiveTheme,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (theme) applyThemeToDocument(theme);
  }, [theme]);

  return <>{children}</>;
}
