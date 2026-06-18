import React, { useState } from 'react';
import { FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { PurchaseRequest } from '../../../types';
import { PRSummaryTable } from './PRSummaryTable';
import { formatCurrency } from '../../../utils/format';

interface Props {
  pr: PurchaseRequest;
}

const SYSTEM_STATUSES = [
  'Initiated', 'pr_submitted',
  'Tender Details Registered',
  'Bid Selected', 'PO Cancelled', 'Tender Cancelled',
  'Bill Passed (PR Completed)',
  'Auto-forwarded',
];

function isSystemEntry(status: string): boolean {
  return SYSTEM_STATUSES.some(s => status === s || status?.includes(s));
}

function formatActedAt(raw: string): string {
  const iso =
    raw.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(raw) ? raw : raw + 'Z';
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

function statusLabel(status: string): string {
  const s = status?.toLowerCase() ?? '';
  if (s.includes('reject')) return 'Rejected';
  if (s.includes('sent back') || s.includes('reflect')) return 'Sent Back';
  return 'Approved';
}

export const CollapsibleIndentPanel: React.FC<Props> = ({ pr }) => {
  const [open, setOpen] = useState(false);

  const approvalTrail = (pr.history ?? []).filter(h => {
    if (!h.frozen_actor_name) return false;
    if (h.status?.includes('Voided')) return false;
    return !isSystemEntry(h.status ?? '');
  });

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden shadow-sm bg-white">

      {/* ── Toggle header ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-[#0f2a54] hover:bg-[#152f5e] transition-colors text-left"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={14} className="text-blue-200 shrink-0" />
          <div className="min-w-0">
            <span className="text-[11px] font-bold text-white uppercase tracking-widest">
              Purchase Indent Document
            </span>
            <span className="ml-3 text-[10px] text-blue-200 font-medium hidden sm:inline opacity-80">
              {pr.icr_number ?? `PI-${pr.id}`}
              {pr.initiator?.name ? ` · ${pr.initiator.name}` : ''}
              {pr.initiator?.department?.name ? ` · ${pr.initiator.department.name}` : ''}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-3">
          {approvalTrail.length > 0 && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] font-bold text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
              ✓ {approvalTrail.length} approval{approvalTrail.length > 1 ? 's' : ''}
            </span>
          )}
          <span className="text-[10px] text-blue-200 font-medium hidden md:block opacity-70">
            {open ? 'Close' : 'View Document'}
          </span>
          {open
            ? <ChevronUp size={14} className="text-blue-200" />
            : <ChevronDown size={14} className="text-blue-200" />}
        </div>
      </button>

      {/* ── Expanded body ─────────────────────────────────────────────── */}
      {open && (
        <div className="bg-gray-100 p-4 md:p-8 border-t border-gray-300">

          {/* Paper document container */}
          <div className="max-w-4xl mx-auto shadow-lg">
            <PRSummaryTable pr={pr} formatCurrency={formatCurrency} />

            {/* ── Approval / Certification Table ─────────────────────── */}
            {approvalTrail.length > 0 && (
              <div
                className="border-2 border-gray-800 border-t-0"
                style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
              >
                <div className="border-b border-gray-400 px-3 py-2 bg-gray-100">
                  <p className="text-[11px] font-bold text-gray-800 uppercase tracking-widest">
                    Approval &amp; Certification Record
                  </p>
                </div>

                <table className="w-full border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="border border-gray-300 px-2 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-8">No.</th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Name &amp; Designation</th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Department</th>
                      <th className="border border-gray-300 px-3 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Date</th>
                      <th className="border border-gray-300 px-3 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Status</th>
                      <th className="border border-gray-300 px-3 py-2 text-center text-[10px] font-bold text-gray-600 uppercase tracking-wider w-24">Signature</th>
                      <th className="border border-gray-300 px-3 py-2 text-left text-[10px] font-bold text-gray-600 uppercase tracking-wider">Remarks</th>
                    </tr>
                  </thead>
                  <tbody>
                    {approvalTrail.map((h, i) => {
                      const label = statusLabel(h.status ?? '');
                      const isRejected = label === 'Rejected';
                      const isSentBack = label === 'Sent Back';
                      return (
                        <tr key={h.id} className={isRejected ? 'bg-red-50' : isSentBack ? 'bg-amber-50' : ''}>
                          <td className="border border-gray-300 px-2 py-2 text-center text-gray-600 align-top">{i + 1}</td>
                          <td className="border border-gray-300 px-3 py-2 align-top">
                            <p className="font-bold text-gray-900">{h.frozen_actor_name}</p>
                            {h.frozen_designation && (
                              <p className="text-[10px] text-gray-500 mt-0.5">{h.frozen_designation}</p>
                            )}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 align-top text-gray-600">
                            {h.frozen_department || '—'}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 text-center align-top text-gray-700">
                            {h.acted_at ? formatActedAt(h.acted_at) : '—'}
                          </td>
                          <td className="border border-gray-300 px-2 py-2 text-center align-top">
                            <span className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
                              isRejected
                                ? 'border-red-400 text-red-700 bg-red-50'
                                : isSentBack
                                  ? 'border-amber-400 text-amber-700 bg-amber-50'
                                  : 'border-green-400 text-green-700 bg-green-50'
                            }`}>
                              {label}
                            </span>
                          </td>
                          <td className="border border-gray-300 px-2 py-2 align-top text-center">
                            {h.frozen_signature_path ? (
                              <img
                                src={h.frozen_signature_path}
                                alt="Signature"
                                className="h-10 w-20 object-contain mx-auto"
                              />
                            ) : (
                              <span className="text-[10px] text-gray-400 italic">—</span>
                            )}
                          </td>
                          <td className="border border-gray-300 px-3 py-2 align-top text-gray-600 italic text-[10px]">
                            {h.remarks || '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div className="border-t border-gray-400 px-4 py-3 bg-gray-50">
                  <p className="text-[10px] text-gray-500 text-center">
                    This document is an official record of the Purchase Indent and approval process under NIT Tiruchirappalli procurement rules.
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
};
