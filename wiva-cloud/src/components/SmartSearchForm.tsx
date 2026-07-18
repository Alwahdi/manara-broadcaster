"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const key = "wiva-recent-searches";

export function SmartSearchForm({ query }: { query: string }) {
  const [value, setValue] = useState(query); const [recent, setRecent] = useState<string[]>([]);
  useEffect(() => { try { setRecent(JSON.parse(localStorage.getItem(key) || "[]").filter((item: unknown) => typeof item === "string").slice(0, 6)); } catch {} }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    if (!value.trim()) { event.preventDefault(); return; }
    const next = [value.trim(), ...recent.filter((item) => item !== value.trim())].slice(0, 6); setRecent(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
  }
  return <><form className="search-form" action="/search" onSubmit={submit} role="search"><Search size={20} aria-hidden="true" /><input name="q" value={value} onChange={(event) => setValue(event.target.value)} placeholder="اكتب اسم قناة أو فيلم أو مسلسل…" aria-label="ابحث في المحتوى" autoComplete="off" enterKeyHint="search" />{value ? <button className="search-clear" type="button" onClick={() => setValue("")} aria-label="مسح البحث"><X /></button> : null}<button className="button primary">بحث</button></form>{!query && recent.length ? <div className="recent-searches"><span>عمليات بحث سابقة</span><div>{recent.map((item) => <Link key={item} href={`/search?q=${encodeURIComponent(item)}`}><Search aria-hidden="true" />{item}</Link>)}</div></div> : null}</>;
}
