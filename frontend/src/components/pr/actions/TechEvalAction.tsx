import React, { useState, useEffect } from 'react';
import {
  CheckCircle2, XCircle, RotateCcw, FileText, Clock, Plus, Trash2, Users
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PurchaseRequest, CommitteeMember } from '../../../types';
import toast from 'react-hot-toast';

interface BidderRow {
  id?: number;
  name: string;
  bidder_id: string;
  emd_status: string;
  msme_status: string;
  oem_status: string;
  mii_class: string;
  land_border_status: string;
  tech_status: string;
  remarks: string;
}

const EMD_OPTIONS = ['Submitted', 'Not Submitted'];
const MSME_OPTIONS = ['Submitted', 'Not Submitted'];
const OEM_OPTIONS = ['Submitted', 'Not Submitted', 'OEM Bidder'];
const MII_OPTIONS = ['Class I', 'Class II', 'Non-Local'];
const LAND_BORDER_OPTIONS = ['Submitted', 'Not Submitted'];
const STATUS_OPTIONS = ['Qualified', 'Not Qualified'];

const SELECT_CLS = 'text-[10px] border border-slate-300 rounded px-1 py-0.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-full';

function BidderTable({
  rows,
  onChange,
  editable,
  onAddRow,
  onRemoveRow,
}: {
  rows: BidderRow[];
  onChange?: (idx: number, field: keyof BidderRow, val: string) => void;
  editable: boolean;
  onAddRow?: () => void;
  onRemoveRow?: (idx: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded border border-slate-200">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="bg-[#1a3a6b] text-white">
            {['Sl.', 'Bidder Name', 'Bidder ID', 'EMD', 'MSME', 'OEM', 'MII Class', 'Land Border', 'Status', 'Remarks'].map(h => (
              <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap border-r border-blue-900/30 last:border-r-0">{h}</th>
            ))}
            {editable && <th className="px-2 py-1.5 w-6"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} className={`border-t border-slate-100 ${r.tech_status === 'Not Qualified' ? 'bg-red-50/40' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}>
              <td className="px-2 py-1 text-center font-semibold text-slate-500">{idx + 1}</td>
              <td className="px-2 py-1 min-w-[120px]">
                {editable ? (
                  <input className="text-[10px] border border-slate-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.name} onChange={e => onChange?.(idx, 'name', e.target.value)} placeholder="Bidder name" />
                ) : <span className="font-semibold text-slate-800">{r.name || '—'}</span>}
              </td>
              <td className="px-2 py-1 min-w-[90px]">
                {editable ? (
                  <input className="text-[10px] border border-slate-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.bidder_id} onChange={e => onChange?.(idx, 'bidder_id', e.target.value)} placeholder="Bidder ID" />
                ) : <span className="text-slate-600">{r.bidder_id || '—'}</span>}
              </td>
              {[
                { field: 'emd_status' as keyof BidderRow, opts: EMD_OPTIONS },
                { field: 'msme_status' as keyof BidderRow, opts: MSME_OPTIONS },
                { field: 'oem_status' as keyof BidderRow, opts: OEM_OPTIONS },
                { field: 'mii_class' as keyof BidderRow, opts: MII_OPTIONS },
                { field: 'land_border_status' as keyof BidderRow, opts: LAND_BORDER_OPTIONS },
              ].map(({ field, opts }) => (
                <td key={field} className="px-1.5 py-1 min-w-[90px]">
                  {editable ? (
                    <select className={SELECT_CLS} value={r[field] as string}
                      onChange={e => onChange?.(idx, field, e.target.value)}>
                      <option value="">—</option>
                      {opts.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <span className={`text-[10px] ${r[field] === 'Not Submitted' ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                      {(r[field] as string) || '—'}
                    </span>
                  )}
                </td>
              ))}
              <td className="px-1.5 py-1 min-w-[90px]">
                {editable ? (
                  <select className={`${SELECT_CLS} ${r.tech_status === 'Qualified' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' : r.tech_status === 'Not Qualified' ? 'bg-red-50 text-red-700 border-red-300' : ''}`}
                    value={r.tech_status} onChange={e => onChange?.(idx, 'tech_status', e.target.value)}>
                    <option value="">—</option>
                    {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.tech_status === 'Qualified' ? 'bg-emerald-100 text-emerald-700' : r.tech_status === 'Not Qualified' ? 'bg-red-100 text-red-700' : 'text-slate-500'}`}>
                    {r.tech_status || '—'}
                  </span>
                )}
              </td>
              <td className="px-1.5 py-1 min-w-[120px]">
                {editable ? (
                  <input className="text-[10px] border border-slate-300 rounded px-1 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-400"
                    value={r.remarks} onChange={e => onChange?.(idx, 'remarks', e.target.value)} placeholder="Remarks" />
                ) : <span className="text-slate-500">{r.remarks || '—'}</span>}
              </td>
              {editable && (
                <td className="px-1 py-1 text-center">
                  <button onClick={() => onRemoveRow?.(idx)} className="text-red-400 hover:text-red-600 transition">
                    <Trash2 size={11} />
                  </button>
                </td>
              )}
            </tr>
          ))}
          {editable && (
            <tr className="border-t border-dashed border-slate-200 bg-slate-50">
              <td colSpan={11} className="px-2 py-1.5">
                <button onClick={onAddRow}
                  className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 font-semibold transition">
                  <Plus size={11} /> Add Bidder
                </button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Committee Tracker Panel ─────────────────────────────────────────────────
const CommitteeProgressPanel: React.FC<{ tracker: CommitteeMember[]; pr: PurchaseRequest }> = ({ tracker, pr }) => {
  const approved = tracker.filter(m => m.approved).length;
  const total = tracker.length;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between">
        <h5 className="text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
          <Users size={13} className="text-blue-600" /> Committee Evaluation Progress
        </h5>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${approved === total ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>
          {approved} of {total} Approved
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-500 ${approved === total ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: total > 0 ? `${(approved / total) * 100}%` : '0%' }}
        />
      </div>

      <div className="space-y-2">
        {tracker.map(m => {
          const memberDoc = pr.documents?.find((d: any) => d.doc_key === `tech_eval_doc_${m.user_id}`);
          return (
            <div key={m.slot} className={`flex items-center justify-between p-3 rounded-lg border bg-white transition-all ${m.approved ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'}`}>
              <div className="flex flex-col gap-0.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`w-5 h-5 flex items-center justify-center rounded-full text-[9px] font-bold shrink-0 ${m.approved ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {m.slot}
                  </span>
                  <span className="text-sm font-bold text-slate-800 truncate">
                    {m.user_name || <span className="text-red-500 italic">Not Assigned</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <span className="text-[10px] text-slate-500">{m.role_label}</span>
                  {m.user_designation && (
                    <span className="text-[10px] text-slate-400">• {m.user_designation}</span>
                  )}
                </div>
                {m.approved && m.approved_at && (
                  <div className="pl-6 text-[10px] text-emerald-600 font-semibold">
                    Approved on {new Date(m.approved_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {memberDoc && (
                  <a href={memberDoc.path} target="_blank" rel="noopener noreferrer"
                    className="pl-6 text-blue-600 hover:underline font-bold text-[10px] flex items-center gap-1 mt-0.5">
                    <FileText size={10} /> View Evaluation Report
                  </a>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {m.user_id === null ? (
                  <span className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-100 rounded px-1.5 py-0.5">Not Configured</span>
                ) : m.approved ? (
                  <>
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-1.5 py-0.5">Approved</span>
                    <CheckCircle2 size={15} className="text-emerald-600" />
                  </>
                ) : (
                  <>
                    <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5 animate-pulse">Pending</span>
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin" />
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface TechEvalActionProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
  hasPrevStep: boolean;
  isLastStep: boolean;
  onReject: (remarks: string) => Promise<void>;
  onSendBack: (remarks: string) => Promise<void>;
  showSendBackModal: boolean;
  setShowSendBackModal: (show: boolean) => void;
  remarks: string;
  setRemarks: (val: string) => void;
}

export const TechEvalAction: React.FC<TechEvalActionProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
  hasPrevStep,
  isLastStep,
  onReject,
  showSendBackModal,
  setShowSendBackModal,
  remarks,
  setRemarks
}) => {
  const [techEvalPdf, setTechEvalPdf] = useState<File | null>(null);
  const [bidderRows, setBidderRows] = useState<BidderRow[]>([]);
  const [saving, setSaving] = useState(false);

  const tracker: CommitteeMember[] = pr.committee_tracker ?? [];
  const committeeIds = tracker.map(m => m.user_id).filter((id): id is number => id !== null);
  const isCommitteeMember = committeeIds.includes(user?.id ?? -1);
  const isInitiator = user?.id === pr.initiator_id;
  const stepType = pr.flow?.step_type;

  const since = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;

  const allCommitteeSigned = tracker.length > 0 && tracker.every(m => m.user_id === null || m.approved);

  const hasUserSigned = tracker.find(m => m.user_id === user?.id)?.approved ?? false;

  const userTechEvalDocKey = `tech_eval_doc_${user?.id}`;
  const userTechEvalDoc = pr.documents?.find((d: any) => d.doc_key === userTechEvalDocKey);

  useEffect(() => {
    const ces = pr.commercial_evaluations ?? [];
    setBidderRows(ces.map(ce => ({
      id: ce.id,
      name: ce.vendor_name ?? '',
      bidder_id: ce.vendor_email ?? '',
      emd_status: ce.emd_status ?? '',
      msme_status: ce.msme_status ?? '',
      oem_status: ce.oem_status ?? '',
      mii_class: ce.mii_class ?? '',
      land_border_status: ce.land_border_status ?? '',
      tech_status: ce.tech_status ?? '',
      remarks: ce.remarks ?? '',
    })));
  }, [pr.id, (pr.commercial_evaluations ?? []).length]);

  const handleBidderChange = (idx: number, field: keyof BidderRow, val: string) => {
    setBidderRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));
  };

  const handleAddRow = () => {
    setBidderRows(prev => [...prev, {
      name: '', bidder_id: '', emd_status: '', msme_status: '', oem_status: '',
      mii_class: '', land_border_status: '', tech_status: '', remarks: ''
    }]);
  };

  const handleRemoveRow = (idx: number) => {
    setBidderRows(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      await prApi.saveTeBidderData(pr.id, { bidders: bidderRows });
      toast.success('Bidder assessment saved as draft');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePISubmit = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required'); return; }
    const missing = bidderRows.filter(r => r.name.trim() && !r.tech_status);
    if (missing.length > 0) { toast.error('Please set Status (Qualified/Not Qualified) for all bidders'); return; }
    if (!window.confirm('Submit bidder assessment and advance to Technical Committee?')) return;

    setActionLoading(true);
    try {
      await prApi.saveTeBidderData(pr.id, { bidders: bidderRows });
      await prApi.advance(pr.id, remarks);
      toast.success('Bidder assessment submitted. Advancing to committee evaluation.');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  // ── Committee size label ────────────────────────────────────────────────────
  const committeeSizeLabel = tracker.length === 1
    ? '1 Technical Expert (HOD Nominee)'
    : tracker.length === 2
      ? '2 Technical Experts (HOD Nominees)'
      : tracker.length === 3
        ? '2 HOD Nominees + 1 Director Nominee'
        : null;

  // ── CASE 1: PI data-entry step ──────────────────────────────────────────────
  if (stepType === 'purchase_initiator' && isInitiator) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <div className="bg-[#1a3a6b] text-white rounded px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wide">Technical Evaluation — Bidder Assessment</h4>
          <p className="text-[10px] text-blue-200 mt-0.5">Fill EMD, MSME, OEM, MII Class, Land Border status and qualification for each bidder</p>
        </div>

        {bidderRows.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-200 rounded bg-slate-50 space-y-1">
            <p className="text-sm text-slate-500 italic">No bidders registered from tendering phase.</p>
            <p className="text-xs text-slate-400">Add bidder rows below.</p>
            <button onClick={handleAddRow} className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold mx-auto">
              <Plus size={12} /> Add Bidder
            </button>
          </div>
        ) : (
          <BidderTable rows={bidderRows} onChange={handleBidderChange} editable={true}
            onAddRow={handleAddRow} onRemoveRow={handleRemoveRow} />
        )}

        {/* Preview committee that will need to sign */}
        {tracker.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-1.5">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
              <Users size={11} /> Committee ({committeeSizeLabel}) — will sign after your submission
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-1">
              {tracker.map(m => (
                <div key={m.slot} className="text-[10px] bg-white border border-blue-100 rounded px-2 py-1.5">
                  <div className="font-bold text-slate-700">{m.user_name || <span className="text-red-500 italic">Not assigned</span>}</div>
                  <div className="text-slate-500">{m.role_label}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Remarks on bidder assessment and technical evaluation summary..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleSaveDraft} disabled={saving || actionLoading}
            className="btn-secondary border border-slate-300 text-slate-700 bg-slate-50 hover:bg-slate-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
            {saving ? 'Saving…' : 'Save Draft'}
          </button>
          <button onClick={handlePISubmit} disabled={actionLoading || !remarks.trim()}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Submit & Advance to Committee
          </button>
          {hasPrevStep && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  const isCommitteeStep = stepType === 'tech_evaluation';

  // ── CASE 2: Non-committee step (HOD/ADPD/Dean approve & forward) ────────────
  if (pr.flow && !isCommitteeStep) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Approve &amp; Forward Technical Evaluation
        </h4>

        {bidderRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Bidder Assessment</div>
            <BidderTable rows={bidderRows} editable={false} />
          </div>
        )}

        {tracker.length > 0 && <CommitteeProgressPanel tracker={tracker} pr={pr} />}

        <div className="space-y-2">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide technical evaluation review remarks..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={async () => {
            if (!remarks.trim()) { toast.error('Remarks required'); return; }
            if (!window.confirm('Approve and advance?')) return;
            setActionLoading(true);
            try { await prApi.advance(pr.id, remarks); toast.success('Advanced'); setRemarks(''); refetch(); }
            catch (e: any) { toast.error(e.response?.data?.detail || 'Action failed'); }
            finally { setActionLoading(false); }
          }} disabled={actionLoading || !remarks.trim()} className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Approve &amp; Forward
          </button>
          {isLastStep && (
            <button onClick={() => onReject(remarks)} disabled={actionLoading || !remarks.trim()} className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4">
              <XCircle size={14} /> Reject
            </button>
          )}
          {hasPrevStep && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── CASE 3: PI confirms after all committee signed ──────────────────────────
  if (isCommitteeStep && allCommitteeSigned && isInitiator) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
          Technical Evaluation — Confirm &amp; Advance
        </h4>
        <p className="text-xs text-slate-500">
          All {tracker.length} committee member(s) have submitted their evaluations. Review the bidder assessment and confirm to advance.
        </p>

        {bidderRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Bidder Assessment Summary</div>
            <BidderTable rows={bidderRows} editable={false} />
          </div>
        )}

        <CommitteeProgressPanel tracker={tracker} pr={pr} />

        <div className="space-y-2 border-t border-slate-100 pt-3">
          <label className="label text-slate-700 font-bold text-xs">Overall Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Overall technical evaluation summary remarks..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>
        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={async () => {
            if (!remarks.trim()) { toast.error('Remarks required'); return; }
            if (!window.confirm('Confirm and advance to Financial Sanction?')) return;
            setActionLoading(true);
            try { await prApi.advance(pr.id, remarks); toast.success('Technical evaluation confirmed. Advanced.'); setRemarks(''); refetch(); }
            catch (e: any) { toast.error(e.response?.data?.detail || 'Action failed'); }
            finally { setActionLoading(false); }
          }} disabled={actionLoading || !remarks.trim()}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Confirm &amp; Advance
          </button>
          {hasPrevStep && (
            <button onClick={() => setShowSendBackModal(true)} disabled={actionLoading}
              className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition">
              <RotateCcw size={14} /> Send Back
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── CASE 4: Committee member who already signed ─────────────────────────────
  if (isCommitteeStep && isCommitteeMember && hasUserSigned) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Technical Committee Evaluation</h4>
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg p-4 space-y-2">
          <div className="font-semibold flex items-center gap-2 text-emerald-900 text-sm">
            <CheckCircle2 size={16} className="text-emerald-600" /> You have submitted your evaluation
          </div>
          <p className="text-xs text-emerald-700">
            {allCommitteeSigned
              ? 'All committee members have submitted. Waiting for the purchase initiator to confirm.'
              : 'Waiting for other committee members to submit their evaluations.'}
          </p>
          {userTechEvalDoc && (
            <div className="flex items-center gap-2 text-xs bg-white border border-emerald-100 rounded px-2 py-1.5 mt-1">
              <FileText size={13} className="text-emerald-600 shrink-0" />
              <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                {userTechEvalDoc.original_name}
              </a>
            </div>
          )}
        </div>

        {bidderRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Bidder Assessment (Filled by PI)</div>
            <BidderTable rows={bidderRows} editable={false} />
          </div>
        )}

        <CommitteeProgressPanel tracker={tracker} pr={pr} />
      </div>
    );
  }

  // ── CASE 5: Committee member who hasn't signed yet ──────────────────────────
  if (isCommitteeStep && isCommitteeMember && !hasUserSigned) {
    const mySlot = tracker.find(m => m.user_id === user?.id);

    const handleCommitteeSubmit = async () => {
      if (!remarks.trim()) { toast.error('Remarks are required'); return; }
      if (!techEvalPdf && !userTechEvalDoc) {
        toast.error('Please upload your signed Technical Evaluation Report PDF');
        return;
      }
      if (!window.confirm('Submit your technical evaluation? This cannot be undone.')) return;

      const formData = new FormData();
      formData.append('payload', JSON.stringify({ vendors: [], remarks }));
      if (techEvalPdf) formData.append('tech_evaluation_document', techEvalPdf);

      setActionLoading(true);
      try {
        await prApi.addTechnicalEval(pr.id, formData);
        toast.success('Technical evaluation submitted successfully.');
        setRemarks('');
        setTechEvalPdf(null);
        refetch();
      } catch (e: any) {
        toast.error(e.response?.data?.detail || 'Action failed');
      } finally {
        setActionLoading(false);
      }
    };

    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <div className="bg-[#1a3a6b] text-white rounded px-3 py-2">
          <h4 className="text-xs font-bold uppercase tracking-wide">Technical Committee — Submit Your Evaluation</h4>
          {mySlot && <p className="text-[10px] text-blue-200 mt-0.5">Your role: {mySlot.role_label}</p>}
        </div>

        <CommitteeProgressPanel tracker={tracker} pr={pr} />

        {bidderRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide border-b border-slate-100 pb-1">
              Bidder Assessment (Filled by Purchase Initiator)
            </div>
            <BidderTable rows={bidderRows} editable={false} />
          </div>
        )}

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
          <h5 className="text-xs font-bold text-amber-800 uppercase tracking-wide flex items-center gap-1.5">
            <FileText size={14} className="text-amber-600" /> Technical Evaluation Report (PDF) *
          </h5>
          <p className="text-xs text-amber-700">Upload your individually signed Technical Evaluation Report before submitting.</p>
          {userTechEvalDoc && (
            <div className="flex items-center gap-2 text-xs bg-white border border-amber-100 rounded px-2 py-1.5">
              <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
              <span className="font-semibold text-slate-600">Currently saved:</span>
              <a href={userTechEvalDoc.path} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline truncate font-semibold">
                {userTechEvalDoc.original_name}
              </a>
            </div>
          )}
          <input id="tech-eval-pdf" type="file" accept=".pdf,application/pdf"
            onChange={e => setTechEvalPdf(e.target.files?.[0] || null)}
            className="input-field mt-1 text-sm bg-white" required={!userTechEvalDoc} />
          {techEvalPdf && (
            <p className="text-xs text-emerald-700 flex items-center gap-1">
              <CheckCircle2 size={12} /> Selected: <span className="font-semibold">{techEvalPdf.name}</span>
            </p>
          )}
        </div>

        <div className="space-y-2 border-t border-slate-100 pt-2">
          <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
          <textarea value={remarks} onChange={e => setRemarks(e.target.value)}
            placeholder="Provide your technical evaluation remarks / justification..."
            className="input-field min-h-[60px] text-xs py-1.5 bg-white text-sm" required />
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <button onClick={handleCommitteeSubmit}
            disabled={actionLoading || !remarks.trim() || (!techEvalPdf && !userTechEvalDoc)}
            className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs">
            <CheckCircle2 size={14} /> Submit My Evaluation &amp; Approve
          </button>
        </div>
      </div>
    );
  }

  // ── CASE 6: Observer / initiator waiting for committee ──────────────────────
  if (isCommitteeStep) {
    return (
      <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Technical Evaluation</h4>
        <div className="bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3.5 text-xs font-semibold flex items-center gap-2">
          <Clock size={14} className="text-slate-400" />
          {allCommitteeSigned
            ? 'All committee members have submitted. Waiting for purchase initiator to confirm.'
            : 'Waiting for technical evaluation committee members to submit their reports.'}
        </div>
        {bidderRows.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Bidder Assessment</div>
            <BidderTable rows={bidderRows} editable={false} />
          </div>
        )}
        <CommitteeProgressPanel tracker={tracker} pr={pr} />
      </div>
    );
  }

  return null;
};
