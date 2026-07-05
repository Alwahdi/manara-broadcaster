import { useQuery } from "@tanstack/react-query";
import { api, type AgentState } from "@/lib/api";

/** Brand name resolved from Agent state — never hardcodes a product name in the UI. */
export function useBrand() {
  const query = useQuery<AgentState>({
    queryKey: ["agent-state"],
    queryFn: api.agentState,
    staleTime: 60_000,
  });
  const settings = query.data?.settings || {};
  const brand =
    query.data?.brandName ||
    query.data?.networkName ||
    String(settings.brandName || settings.networkName || "") ||
    "شبكتي";
  const logo =
    query.data?.networkLogoDataUrl ||
    String(settings.networkLogoDataUrl || "") ||
    "/wiva-logo.png";
  return { brand, logo, state: query.data, query };
}
