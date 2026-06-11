import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Trophy, Calendar, RefreshCw } from "lucide-react";
import { getMatches, type Match } from "@/lib/matches.functions";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: Match["status"] }) {
  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-live/20 px-2 py-0.5 text-[10px] font-bold text-live">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-live opacity-75"></span>
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-live"></span>
        </span>
        مباشر
      </span>
    );
  }
  if (status === "finished") {
    return <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground">انتهت</span>;
  }
  return <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">قادمة</span>;
}

function TeamSide({ name, badge, score, won }: { name: string; badge: string | null; score: string | null; won: boolean }) {
  return (
    <div className="flex flex-1 items-center gap-2 min-w-0">
      <div className="h-9 w-9 shrink-0 rounded-full bg-white/5 ring-1 ring-white/10 overflow-hidden flex items-center justify-center">
        {badge ? (
          <img src={`${badge}/preview`} alt="" className="h-full w-full object-contain" loading="lazy" />
        ) : (
          <Trophy className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm truncate", won ? "font-bold text-foreground" : "text-foreground/80")}>{name}</p>
      </div>
      {score !== null && (
        <span className={cn("font-mono text-lg font-extrabold tabular-nums shrink-0", won ? "text-primary-glow" : "text-foreground")}>
          {score}
        </span>
      )}
    </div>
  );
}

export function MatchesPanel() {
  const fetchMatches = useServerFn(getMatches);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["matches"],
    queryFn: () => fetchMatches(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const matches = data?.matches ?? [];

  return (
    <div className="glass-panel overflow-hidden rounded-3xl">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/20 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <Trophy className="h-4 w-4 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold">جدول المباريات</h3>
            <p className="text-[10px] text-muted-foreground">تحديث تلقائي • بيانات حية</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="glass-btn rounded-full p-2 text-muted-foreground hover:text-foreground"
          aria-label="تحديث"
        >
          <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="max-h-[640px] overflow-y-auto">
        {isLoading && (
          <div className="space-y-2 p-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 relative overflow-hidden shimmer" />
            ))}
          </div>
        )}

        {!isLoading && matches.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Calendar className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">لا توجد مباريات في الوقت الحالي</p>
          </div>
        )}

        {!isLoading && matches.length > 0 && (
          <ul className="divide-y divide-border">
            {matches.map((m) => {
              const homeScore = m.homeScore !== null ? Number(m.homeScore) : null;
              const awayScore = m.awayScore !== null ? Number(m.awayScore) : null;
              const homeWon = homeScore !== null && awayScore !== null && homeScore > awayScore;
              const awayWon = homeScore !== null && awayScore !== null && awayScore > homeScore;
              return (
                <li key={m.id} className={cn(
                  "px-4 py-3 transition hover:bg-white/[0.03]",
                  m.status === "live" && "bg-live/[0.06]"
                )}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {m.leagueBadge && (
                        <img src={`${m.leagueBadge}/preview`} alt="" className="h-3.5 w-3.5 object-contain" loading="lazy" />
                      )}
                      <span className="text-[10px] font-semibold text-muted-foreground truncate">{m.league}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={m.status} />
                      <span className="text-[10px] font-mono text-muted-foreground">{m.timeLocal}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <TeamSide name={m.homeTeam} badge={m.homeBadge} score={m.homeScore} won={homeWon} />
                    <span className="text-xs text-muted-foreground font-bold">VS</span>
                    <TeamSide name={m.awayTeam} badge={m.awayBadge} score={m.awayScore} won={awayWon} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
