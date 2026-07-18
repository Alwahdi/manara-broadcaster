export function WivaLogo({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-hidden="true">
    <defs><linearGradient id="wiva-logo-gold" x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse"><stop stopColor="#FFE8A9" /><stop offset="1" stopColor="#B7842E" /></linearGradient></defs>
    <rect x="2" y="2" width="60" height="60" rx="18" fill="#0D1220" stroke="rgba(255,255,255,.14)" strokeWidth="2" />
    <path d="M15 26 22.5 46 32 32l9.5 14L49 26" fill="none" stroke="url(#wiva-logo-gold)" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="32" cy="20" r="3.5" fill="#FFE6A2" />
    <path d="M23.5 17.5a12 12 0 0 1 17 0M18.5 12.5a19 19 0 0 1 27 0" fill="none" stroke="#F4F6FF" strokeOpacity=".82" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
}
