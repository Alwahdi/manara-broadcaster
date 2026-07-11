import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type NavigationContextValue = {
  path: string;
  navigate: (href: string) => void;
};

const NavigationContext = createContext<NavigationContextValue | null>(null);

function currentPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(currentPath);

  useEffect(() => {
    const sync = () => setPath(currentPath());
    window.addEventListener("popstate", sync);
    window.addEventListener("wiva:navigate", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("wiva:navigate", sync);
    };
  }, []);

  const navigate = useCallback((href: string) => {
    if (typeof window === "undefined") return;
    if (!href.startsWith("/") || href.startsWith("//")) {
      window.location.href = href;
      return;
    }
    if (href !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.pushState({}, "", href);
    }
    window.dispatchEvent(new Event("wiva:navigate"));
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  const value = useMemo(() => ({ path, navigate }), [navigate, path]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useAppPath() {
  return useContext(NavigationContext)?.path || currentPath();
}

export function useAppNavigate() {
  const nav = useContext(NavigationContext);
  return nav?.navigate || ((href: string) => { window.location.href = href; });
}

function resolveHref(href: string, params?: Record<string, string>) {
  if (!params) return href;
  return Object.entries(params).reduce(
    (next, [key, value]) => next.replace(`$${key}`, encodeURIComponent(value)).replace(`[${key}]`, encodeURIComponent(value)),
    href,
  );
}

export function AppLink({
  href,
  params,
  onClick,
  children,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  params?: Record<string, string>;
}) {
  const navigate = useAppNavigate();
  const finalHref = resolveHref(href, params);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      props.target
    ) {
      return;
    }
    event.preventDefault();
    navigate(finalHref);
  }

  return (
    <a {...props} href={finalHref} onClick={handleClick}>
      {children}
    </a>
  );
}
