"use client";

import { Heart, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function ViewerLibraryActions({ assetId, initialFavorite, authenticated }: { assetId: string; initialFavorite: boolean; authenticated: boolean }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  async function toggle() {
    if (!authenticated) { router.push("/login"); return; }
    const next = !favorite; setPending(true); setMessage("");
    try {
      const response = await fetch(`/api/viewer/activity/${encodeURIComponent(assetId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ favorite: next }) });
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "تعذر حفظ المفضلة");
      setFavorite(payload.activity.favorite); setMessage(payload.activity.favorite ? "أضيف إلى المفضلة" : "أزيل من المفضلة");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ المفضلة"); }
    finally { setPending(false); }
  }
  return <div className="watch-library-actions"><button type="button" className={favorite ? "active" : ""} onClick={() => void toggle()} disabled={pending} aria-pressed={favorite}>{pending ? <LoaderCircle className="spin" /> : <Heart fill={favorite ? "currentColor" : "none"} />}<span>{favorite ? "في المفضلة" : "أضف للمفضلة"}</span></button>{message ? <small role="status">{message}</small> : null}</div>;
}
