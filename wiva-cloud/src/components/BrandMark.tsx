import { brandName } from "@/lib/env";
import { WivaLogo } from "@/components/WivaLogo";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand-mark" aria-label={brandName()}>
      <span className="brand-wordmark"><WivaLogo size={compact ? 84 : 104} /></span>
    </span>
  );
}
