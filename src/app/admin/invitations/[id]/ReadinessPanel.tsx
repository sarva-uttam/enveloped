"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { ReadinessReport } from "@/lib/composition/readiness";

/** Displays a ReadinessReport — Stage 8 Part I. Purely presentational;
 *  the assessment itself (assessPublicationReadiness()) is computed by
 *  the caller, client-side, against the CURRENT DRAFT, so this panel
 *  updates the instant an administrator fixes (or introduces) an issue —
 *  never a separate "check readiness" round-trip to the server. */
export function ReadinessPanel({ report }: { report: ReadinessReport }) {
  return (
    <div className="rounded-2xl border border-line bg-paper-raised p-6">
      <h2 className="font-display text-xl">Publication readiness</h2>
      <p className="mt-1 text-xs text-ink-soft">An assessment only — nothing here publishes anything.</p>

      {report.blocking.length > 0 && (
        <IssueList title="Must fix before publishing" icon={<XCircle className="h-4 w-4 text-red-600" />} issues={report.blocking} tone="text-red-700" />
      )}
      {report.warnings.length > 0 && (
        <IssueList title="Worth reviewing" icon={<AlertTriangle className="h-4 w-4 text-amber-600" />} issues={report.warnings} tone="text-amber-700" />
      )}
      {report.blocking.length === 0 && (
        <p className="mt-4 flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> No blocking issues — this composition looks ready to review with the client.
        </p>
      )}
      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-ink-soft">Successful checks ({report.passed.length})</summary>
        <ul className="mt-2 space-y-1 text-xs text-ink-soft">
          {report.passed.map((issue) => (
            <li key={issue.id} className="flex items-start gap-1.5">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /> {issue.message}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function IssueList({ title, icon, issues, tone }: { title: string; icon: React.ReactNode; issues: { id: string; message: string }[]; tone: string }) {
  return (
    <div className="mt-4">
      <h3 className={`text-xs font-medium uppercase tracking-wide ${tone}`}>{title}</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-ink">
        {issues.map((issue) => (
          <li key={issue.id} className="flex items-start gap-2">
            <span className="mt-0.5 shrink-0">{icon}</span> {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
