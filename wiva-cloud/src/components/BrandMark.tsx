import { RadioTower } from "lucide-react";
import { brandName } from "@/lib/env";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label={`${brandName()} Cloud`}>
      <span className="brand-icon"><RadioTower size={20} strokeWidth={2.4} /></span>
      {!compact ? <span><strong>{brandName()}</strong><small>Cloud</small></span> : null}
    </span>
  );
}
