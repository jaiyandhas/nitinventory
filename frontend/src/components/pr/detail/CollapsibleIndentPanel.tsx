import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import { PRSummaryTable } from './PRSummaryTable';
import { formatCurrency } from '../../../utils/format';

interface Props {
  pr: PurchaseRequest;
}

// Statuses that are system-generated and not real approver actions
const SYSTEM_STATUSES = [
  'Initiated', 'pr_submitted', 'Forwarded', 'Forwarded to next phase',
  'Tender Details Registered', 'Technical Evaluation Completed',
  'Technical Evaluation Approved', 'Financial Bids Submitted',
  'Bid Selected', 'PO Cancelled', 'Tender Cancelled',
  'Bill Passed (PR Completed)',
];

function isSystemEntry(status: string): boolean {
  return SYSTEM_STATUSES.some(s => status === s || status?.includes(s));
}

function formatActedAt(raw: string): string {
  const iso =
    raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + 'Z';
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function badgeClass(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('reject')) return 'bg-red-100 text-red-700';
  if (s.includes('sent back') || s.includes('reflect')) return 'bg-orange-100 text-orange-700';
  if (s.includes('voided')) return 'bg-slate-100 text-slate-500';
  return 'bg-emerald-100 text-emerald-700';
}

function trailIcon(status: string) {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('reject')) return <XCircle size={13} className="text-red-500" />;
  if (s.includes('sent back') || s.includes('reflect')) return <RotateCcw size={13} className="text-orange-500" />;
  return <CheckCircle2 size={13} className="text-emerald-500" />;
}

export const CollapsibleIndentPanel: React.FC<Props> = ({ pr }) => {
  const [open, setOpen] = useState(false);

  // Build approval trail: real human actions only, chronological, skip voided
  const approvalTrail = (pr.history ?? []).filter(h => {
    if (!h.frozen_actor_name) return false;
    if (h.status?.includes('Voided')) return false;
    return !isSystemEntry(h.status ?? '');
  });

  return (
    <div className="border border-indigo-200 rounded-xl overflow-hidden bg-white shadow-sm">
      {/* ── Toggle header ───────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-3 bg-indigo-50 hover:bg-indigo-100/70 transition-colors text-left group"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={15} className="text-indigo-600 shrink-0" />
          <div className="min-w-0">
            <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider">
              Indent / Purchase Request Document
            </span>
            <span className="ml-2.5 text-[10px] text-slate-400 font-medium hidden sm:inline">
              {pr.icr_number ?? `PI-${pr.id}`}
              {pr.initiator?.name ? ` · ${pr.initiator.name}` : ''}
              {pr.initiator?.department?.name ? ` · ${pr.initiator.department.name}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {approvalTrail.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
              <CheckCircle2 size={9} /> {approvalTrail.length} approval{approvalTrail.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-slate-400 font-medium hidden md:block group-hover:text-indigo-600 transition-colors">
            {open ? 'Hide' : 'View full document'}
          </span>
          {open
            ? <ChevronUp size={15} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
            : <ChevronDown size={15} className="text-slate-400 group-hover:text-indigo-600 transition-colors" />
          }
        </div>
      </button>

      {/* ── Expanded body ───────────────────────────────────────────── */}
      {open && (
        <div className="p-5 space-y-6 border-t border-indigo-100">

          {/* Full read-only PR summary */}
          <PRSummaryTable pr={pr} formatCurrency={formatCurrency} />

          {/* ── Workflow Approval Trail ────────────────────────────── */}
          {approvalTrail.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Workflow Approval Trail
                </h4>
                <span className="text-[10px] text-slate-400 font-medium">
                  — actions taken by approvers in sequence
                </span>
              </div>

              <div className="relative space-y-2 pl-2">
                {/* Vertical connector line */}
                <div className="absolute left-5 top-4 bottom-4 w-px bg-slate-200 pointer-events-none" />

                {approvalTrail.map((h, i) => (
                  <div key={h.id} className="relative flex items-start gap-3">
                    {/* Step dot */}
                    <div className="relative z-10 w-7 h-7 rounded-full bg-white border-2 border-emerald-300 flex items-center justify-center shrink-0 shadow-sm mt-0.5">
                      <span className="text-[9px] font-extrabold text-emerald-600">{i + 1}</span>
                    </div>

                    {/* Card */}
                    <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg p-3.5 shadow-xs hover:border-indigo-200 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">

                        {/* Left: signature + identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Signature box */}
                          <div className="w-16 h-10 border border-slate-200 rounded bg-slate-50 flex items-center justify-center shrink-0 overflow-hidden">
                            {h.frozen_signature_path ? (
                              <img
                                src={h.frozen_signature_path}
                                alt="Signature"
                                className="h-full w-full object-contain p-0.5"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-0.5">
                                {trailIcon(h.status ?? '')}
                                <span className="text-[8px] text-slate-400 font-semibold">Signed</span>
                              </div>
                            )}
                          </div>

                          {/* Name / designation */}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {h.frozen_actor_name}
                            </p>
                            {h.frozen_designation && (
                              <p className="text-[10px] text-slate-500 font-medium truncate">
                                {h.frozen_designation}
                              </p>
                            )}
                            {h.frozen_department && (
                              <p className="text-[10px] text-slate-400 truncate">
                                {h.frozen_department}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right: status badge + timestamp */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${badgeClass(h.status ?? '')}`}>
                            {h.status}
                          </span>
                          {h.acted_at && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Clock size={9} />
                              {formatActedAt(h.acted_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Remarks */}
                      {h.remarks && (
                        <div className="mt-2.5 pt-2 border-t border-slate-100">
                          <p className="text-[11px] text-slate-600 leading-relaxed">
                            <span className="font-bold text-slate-400 uppercase text-[9px] tracking-wider mr-1.5">Remarks:</span>
                            <span className="italic">"{h.remarks}"</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}
    </div>
  );
};
