import { brandName } from "@/lib/env";
import { WivaLogo } from "@/components/WivaLogo";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label={brandName()}>
      <span className="brand-icon"><WivaLogo size={42} /></span>
      {!compact ? <span><strong>{brandName()}</strong><small>WATCH</small></span> : null}
    </span>
  );
}
