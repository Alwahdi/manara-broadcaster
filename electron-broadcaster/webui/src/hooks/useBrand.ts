import { useQuery } from "@tanstack/react-query";
import { api, type AgentState } from "@/lib/api";

/** Brand name resolved from Agent state — never hardcodes a product name in the UI. */
export function useBrand() {
  const query = useQuery<AgentState>({
    queryKey: ["agent-state"],
    queryFn: api.agentState,
    staleTime: 60_000,
  });
  const brand =
    query.data?.brandName ||
    query.data?.networkName ||
    "شبكتي";
  return { brand, state: query.data, query };
}
