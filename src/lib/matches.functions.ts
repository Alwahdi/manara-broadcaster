import { createServerFn } from "@tanstack/react-start";

export type Match = {
  id: string;
  homeTeam: string;
  awayTeam: string;
  homeBadge: string | null;
  awayBadge: string | null;
  homeScore: string | null;
  awayScore: string | null;
  league: string;
  leagueBadge: string | null;
  timeLocal: string;
  date: string;
  timestamp: string;
  status: "upcoming" | "live" | "finished";
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function deriveStatus(ev: Record<string, unknown>): Match["status"] {
  const ts = ev.strTimestamp as string | null;
  const home = ev.intHomeScore;
  const away = ev.intAwayScore;
  const hasScore = home !== null && home !== "" && away !== null && away !== "";
  if (!ts) return hasScore ? "finished" : "upcoming";
  const start = new Date(ts).getTime();
  const now = Date.now();
  const diff = now - start;
  if (diff < 0) return "upcoming";
  if (diff < 2.5 * 60 * 60 * 1000) return "live";
  return hasScore ? "finished" : "live";
}

export const getMatches = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const today = new Date();
    const dates = [today, new Date(today.getTime() + 86400000)];
    const all: Match[] = [];

    for (const d of dates) {
      const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${formatDate(d)}&s=Soccer`;
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as { events?: Array<Record<string, unknown>> | null };
      const events = json.events ?? [];
      for (const ev of events) {
        all.push({
          id: String(ev.idEvent),
          homeTeam: String(ev.strHomeTeam ?? ""),
          awayTeam: String(ev.strAwayTeam ?? ""),
          homeBadge: (ev.strHomeTeamBadge as string) || null,
          awayBadge: (ev.strAwayTeamBadge as string) || null,
          homeScore: (ev.intHomeScore as string) || null,
          awayScore: (ev.intAwayScore as string) || null,
          league: String(ev.strLeague ?? ""),
          leagueBadge: (ev.strLeagueBadge as string) || null,
          timeLocal: String(ev.strTime ?? "").slice(0, 5),
          date: String(ev.dateEvent ?? ""),
          timestamp: String(ev.strTimestamp ?? ""),
          status: deriveStatus(ev),
        });
      }
    }

    // Sort: live first, then upcoming by time, then finished
    const order = { live: 0, upcoming: 1, finished: 2 };
    all.sort((a, b) => {
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.timestamp.localeCompare(b.timestamp);
    });

    return { matches: all.slice(0, 40), error: null as string | null };
  } catch (err) {
    console.error("getMatches failed:", err);
    return { matches: [] as Match[], error: "تعذر تحميل المباريات" };
  }
});
