import { WIVA_WORDMARK_DATA_URI } from "@/lib/brand-assets";

export function WivaLogo({ size = 96 }: { size?: number }) {
  return <img src={WIVA_WORDMARK_DATA_URI} width={size} height={Math.round(size * 0.5625)} alt="" aria-hidden="true" decoding="async" />;
}
