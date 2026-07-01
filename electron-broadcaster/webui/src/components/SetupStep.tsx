import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

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
          <Link to={prev} className="btn btn-ghost">السابق</Link>
        ) : (
          <span />
        )}
        {next && !nextDisabled ? (
          <Link to={next} className="btn btn-primary" onClick={onNext}>
            {nextLabel}
          </Link>
        ) : (
          <button className="btn btn-primary" onClick={onNext} disabled={nextDisabled}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}
