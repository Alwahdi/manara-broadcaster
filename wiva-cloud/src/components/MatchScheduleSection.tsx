import { CalendarDays, Clock3, Radio, Trophy, Tv } from "lucide-react";
import type { MatchScheduleEntry } from "@/lib/types";

const dayFormat = new Intl.DateTimeFormat("ar-YE", { weekday: "long", day: "numeric", month: "long" });
const timeFormat = new Intl.DateTimeFormat("ar-YE", { hour: "numeric", minute: "2-digit" });

function dayLabel(value: string) {
  const date = new Date(value);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(date); target.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "اليوم";
  if (days === 1) return "غدًا";
  return dayFormat.format(date);
}

export function MatchScheduleSection({ matches }: { matches: MatchScheduleEntry[] }) {
  if (!matches.length) return null;
  const now = Date.now();
  return <section className="match-schedule-section container" aria-labelledby="match-schedule-title">
    <div className="section-heading match-schedule-heading">
      <div><span className="section-kicker"><CalendarDays /> مواعيد اليوم</span><h2 id="match-schedule-title">جدول المباريات</h2><p>المباريات القادمة والقنوات الناقلة</p></div>
      <span className="schedule-count">{matches.length} {matches.length === 1 ? "مباراة" : "مباريات"}</span>
    </div>
    <div className="match-schedule-grid">
      {matches.map((match) => {
        const start = new Date(match.startsAt); const end = new Date(match.endsAt);
        const live = start.getTime() <= now && end.getTime() > now;
        return <article className={`match-schedule-card ${live ? "live" : ""}`} key={match.id}>
          <header><span><Trophy />{match.competition || "مباراة"}</span><time dateTime={match.startsAt}>{dayLabel(match.startsAt)}</time></header>
          <div className="match-teams"><strong>{match.homeTeam}</strong><span>×</span><strong>{match.awayTeam}</strong></div>
          <footer>
            <span className={live ? "match-live" : "match-time"}>{live ? <><Radio /> مباشر الآن</> : <><Clock3 /> {timeFormat.format(start)}</>}</span>
            <span className="match-channel"><Tv />{match.channelName || "تحدد لاحقًا"}</span>
          </footer>
        </article>;
      })}
    </div>
  </section>;
}
