import clsx from "clsx";
import { DECISION_LABEL, type Decision, type Outcome } from "@/lib/types";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={clsx("rounded-xl border border-navy-100 bg-white shadow-sm", className)}>{children}</section>;
}

export function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-4 py-3">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-navy-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const DECISION_STYLE: Record<Decision, string> = {
  APPROVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  REJECT: "bg-red-50 text-red-700 ring-red-200",
  NEEDS_REVIEW: "bg-amber-50 text-amber-800 ring-amber-200",
};

export function DecisionBadge({ decision, className }: { decision: Decision; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", DECISION_STYLE[decision], className)}>
      {DECISION_LABEL[decision]}
    </span>
  );
}

const OUTCOME_STYLE: Record<Outcome | "n/a", string> = {
  pass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  reject: "bg-red-50 text-red-700 ring-red-200",
  review: "bg-amber-50 text-amber-800 ring-amber-200",
  "n/a": "bg-navy-50 text-navy-500 ring-navy-100",
};
const OUTCOME_LABEL: Record<Outcome | "n/a", string> = { pass: "Pass", reject: "Reject", review: "Review", "n/a": "n/a" };

export function OutcomeBadge({ outcome }: { outcome: Outcome | "n/a" }) {
  return <span className={clsx("inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset", OUTCOME_STYLE[outcome])}>{OUTCOME_LABEL[outcome]}</span>;
}

export function Button({ variant = "primary", className, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      {...p}
      className={clsx(
        "inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" ? "bg-brand text-white hover:bg-brand-dark" : "border border-navy-100 bg-white text-navy-800 hover:bg-navy-50",
        className,
      )}
    />
  );
}
