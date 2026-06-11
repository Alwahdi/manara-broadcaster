/**
 * Animated glassmorphism background — three drifting aurora blobs + grain.
 * Pointer-events disabled. Sits behind all content.
 */
export function AuroraBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="aurora-blob aurora-1 right-[-10%] top-[-15%] h-[520px] w-[520px]" />
      <div className="aurora-blob aurora-2 left-[-15%] top-[30%] h-[480px] w-[480px]" />
      <div className="aurora-blob aurora-3 right-[20%] bottom-[-20%] h-[460px] w-[460px]" />
      <div
        className="absolute inset-0 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
