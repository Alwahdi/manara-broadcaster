"use client";

import { CalendarClock, CheckCircle2, CircleAlert, Clock3, Eye, EyeOff, LoaderCircle, Pencil, Plus, Radio, Trash2, Trophy, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { MatchScheduleEntry } from "@/lib/types";

function dateTimeLocal(value: string | Date) {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function defaultTimes() {
  const start = new Date();
  start.setMinutes(0, 0, 0); start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60_000);
  return { start: dateTimeLocal(start), end: dateTimeLocal(end) };
}

const dateFormat = new Intl.DateTimeFormat("ar-YE", { weekday: "short", day: "numeric", month: "short" });
const timeFormat = new Intl.DateTimeFormat("ar-YE", { hour: "numeric", minute: "2-digit" });

export function MatchScheduleManager({ initial }: { initial: MatchScheduleEntry[] }) {
  const [matches, setMatches] = useState(initial);
  const [editing, setEditing] = useState<MatchScheduleEntry | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error">("success");
  const defaults = useMemo(defaultTimes, [editing]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setPending(true); setMessage("");
    try {
      const body = { ...fields, startsAt: new Date(fields.startsAt).toISOString(), endsAt: new Date(fields.endsAt).toISOString(), isActive: editing?.isActive ?? true };
      const response = await fetch(editing ? `/api/admin/schedule/${editing.id}` : "/api/admin/schedule", {
        method: editing ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setMatches(payload.matches); setEditing(null); form.reset(); setTone("success"); setMessage(editing ? "تم تحديث المباراة." : "تمت إضافة المباراة إلى الجدول.");
    } catch (error) { setTone("error"); setMessage(error instanceof Error ? error.message : "تعذر حفظ المباراة"); }
    finally { setPending(false); }
  }

  async function toggle(match: MatchScheduleEntry) {
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/schedule/${match.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: !match.isActive }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setMatches(payload.matches); setTone("success"); setMessage(match.isActive ? "تم إخفاء المباراة عن المشاهدين." : "تم نشر المباراة في الرئيسية.");
    } catch (error) { setTone("error"); setMessage(error instanceof Error ? error.message : "تعذر تغيير حالة المباراة"); }
    finally { setPending(false); }
  }

  async function remove(match: MatchScheduleEntry) {
    if (!window.confirm(`حذف مباراة ${match.homeTeam} و${match.awayTeam}؟`)) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/admin/schedule/${match.id}`, { method: "DELETE" });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      setMatches(payload.matches); if (editing?.id === match.id) setEditing(null); setTone("success"); setMessage("تم حذف المباراة.");
    } catch (error) { setTone("error"); setMessage(error instanceof Error ? error.message : "تعذر حذف المباراة"); }
    finally { setPending(false); }
  }

  return <div className="manager-grid schedule-manager-grid">
    <section className="ops-card schedule-admin-list">
      <div className="ops-card-heading"><div><CalendarClock /><span><h2>المواعيد المسجلة</h2><p>تظهر المواعيد المنشورة تلقائيًا في الصفحة الرئيسية.</p></span></div><span className="count-badge">{matches.length}</span></div>
      {message ? <p className={`form-message ${tone}`} role={tone === "error" ? "alert" : "status"}>{tone === "error" ? <CircleAlert /> : <CheckCircle2 />}{message}</p> : null}
      <div className="schedule-admin-cards">
        {matches.map((match) => {
          const now = Date.now(); const live = new Date(match.startsAt).getTime() <= now && new Date(match.endsAt).getTime() > now;
          return <article key={match.id} className={!match.isActive ? "disabled" : undefined}>
            <div className="schedule-admin-date"><strong>{timeFormat.format(new Date(match.startsAt))}</strong><span>{dateFormat.format(new Date(match.startsAt))}</span>{live ? <i><Radio /> الآن</i> : null}</div>
            <div className="schedule-admin-teams"><small>{match.competition || "مباراة"}</small><strong>{match.homeTeam}<b>×</b>{match.awayTeam}</strong><span>{match.channelName || "القناة لم تحدد"}</span></div>
            <div className="schedule-admin-actions">
              <button onClick={() => setEditing(match)} disabled={pending} aria-label="تعديل المباراة"><Pencil /></button>
              <button onClick={() => void toggle(match)} disabled={pending} aria-label={match.isActive ? "إخفاء المباراة" : "نشر المباراة"}>{match.isActive ? <Eye /> : <EyeOff />}</button>
              <button className="danger" onClick={() => void remove(match)} disabled={pending} aria-label="حذف المباراة"><Trash2 /></button>
            </div>
          </article>;
        })}
        {!matches.length ? <div className="inline-empty"><Trophy /><p>لا توجد مباريات مسجلة. أضف أول مباراة من النموذج.</p></div> : null}
      </div>
    </section>
    <section className="ops-card sticky-card">
      <div className="ops-card-heading"><div>{editing ? <Pencil /> : <Plus />}<span><h2>{editing ? "تعديل المباراة" : "إضافة مباراة"}</h2><p>الوقت سيظهر للمشاهد وفق توقيت جهازه.</p></span></div>{editing ? <button className="icon-button compact" onClick={() => setEditing(null)} aria-label="إلغاء التعديل"><X /></button> : null}</div>
      <form className="stack-form" onSubmit={save} key={editing?.id || "new"}>
        <div className="form-pair"><label>الفريق الأول<input name="homeTeam" required maxLength={100} defaultValue={editing?.homeTeam || ""} /></label><label>الفريق الثاني<input name="awayTeam" required maxLength={100} defaultValue={editing?.awayTeam || ""} /></label></div>
        <label>البطولة<input name="competition" maxLength={120} placeholder="مثال: دوري أبطال أوروبا" defaultValue={editing?.competition || ""} /></label>
        <label>القناة الناقلة<input name="channelName" maxLength={120} placeholder="مثال: beIN Sports 1" defaultValue={editing?.channelName || ""} /></label>
        <div className="form-pair"><label><span><Clock3 /> وقت البداية</span><input name="startsAt" type="datetime-local" required defaultValue={editing ? dateTimeLocal(editing.startsAt) : defaults.start} /></label><label><span><Clock3 /> وقت النهاية</span><input name="endsAt" type="datetime-local" required defaultValue={editing ? dateTimeLocal(editing.endsAt) : defaults.end} /></label></div>
        <button className="button primary wide" disabled={pending}>{pending ? <LoaderCircle className="spin" /> : editing ? <Pencil /> : <Plus />}{editing ? "حفظ التعديل" : "إضافة إلى الجدول"}</button>
      </form>
    </section>
  </div>;
}
