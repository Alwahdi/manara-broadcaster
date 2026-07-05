import type { ReactNode } from "react";
import { AppLink } from "@/components/AppLink";

/** Consistent header + next/back footer for setup steps. */
export function SetupStep({
  title,
  subtitle,
  children,
  prev,
  next,
  onNext,
  nextLabel = "التالي",
  nextDisabled,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  prev?: string;
  next?: string;
  onNext?: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div style={{ animation: "rise 0.4s ease both" }}>
      <h1 className="page-title">{title}</h1>
      {subtitle ? <p className="page-subtitle" style={{ marginBottom: 24 }}>{subtitle}</p> : null}
      <div style={{ marginBottom: 28 }}>{children}</div>
      <div className="row-between">
        {prev ? (
          <AppLink href={prev} className="btn btn-ghost">السابق</AppLink>
        ) : (
          <span />
        )}
        {next && !nextDisabled ? (
          <AppLink href={next} className="btn btn-primary" onClick={onNext}>
            {nextLabel}
          </AppLink>
        ) : (
          <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
