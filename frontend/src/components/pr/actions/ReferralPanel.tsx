import React, { useState } from 'react';
import { Users, Download, ShieldAlert, MessageSquare, Clock, CheckCircle2, ChevronDown, ChevronUp, Send, FileText } from 'lucide-react';
import { prApi, budgetApi } from '../../../services/api';
import { PurchaseRequest, PRReferral } from '../../../types';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface ReferralPanelProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
}

function formatDateTime(dt: string | null) {
  if (!dt) return '—';
  // Ensure the string is parsed as UTC — append 'Z' if no timezone offset is present
  const iso = dt.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dt) ? dt : dt + 'Z';
  const d = new Date(iso);
  return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getInitials(name: string | undefined) {
  if (!name) return '?';
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function ReferralThreadItem({ referral, index }: { referral: PRReferral; index: number }) {
  const [expanded, setExpanded] = useState(true);
  const isPending = referral.status === 'pending';
  const isResponded = referral.status === 'responded';

  return (
    <div className="relative pl-10">
      {/* Thread line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-indigo-200 via-slate-200 to-transparent" />

      {/* Avatar bubble */}
      <div
        className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow-sm border-2
          ${isPending ? 'bg-amber-100 border-amber-300 text-amber-700' : 'bg-indigo-100 border-indigo-300 text-indigo-700'}`}
      >
        {getInitials(referral.referred_by?.name)}
      </div>

      <div className={`bg-white rounded-xl border shadow-sm mb-4 overflow-hidden
        ${isPending ? 'border-amber-200' : 'border-indigo-100'}`}
      >
        {/* Header */}
        <button
          type="button"
          onClick={() => setExpanded((p) => !p)}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-left
            ${isPending ? 'bg-amber-50' : 'bg-indigo-50/70'}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
              ${isPending ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}`}>
              {isPending ? (
                <span className="flex items-center gap-1"><Clock size={9} /> Awaiting Response</span>
              ) : (
                <span className="flex items-center gap-1"><CheckCircle2 size={9} /> Responded</span>
              )}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Round #{index + 1}</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] text-slate-500">{formatDateTime(referral.created_at)}</span>
          </div>
          <span className="text-slate-400 ml-2">
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {expanded && (
          <div className="p-4 space-y-4">
            {/* Query block */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Send size={11} className="text-indigo-500 rotate-[315deg]" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Consultation Query — {referral.referred_by?.name || 'Unknown'}
                  <span className="font-normal ml-1 normal-case">to</span> {referral.referred_to?.name || 'Unknown'}
                </span>
              </div>
              <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 italic leading-relaxed">
                "{referral.query}"
              </p>
              {referral.query_document_path && (
                <a
                  href={referral.query_document_path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold mt-1"
                >
                  <FileText size={11} />
                  Download Query Attachment ({referral.query_document_path.split('.').pop()?.toUpperCase()})
                </a>
              )}
            </div>

            {/* Response block */}
            {isResponded && referral.response ? (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <MessageSquare size={11} className="text-emerald-500" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Response — {referral.referred_to?.name || 'Unknown'}
                    <span className="text-[10px] text-slate-300 font-normal ml-1.5">· {formatDateTime(referral.responded_at)}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2.5 leading-relaxed">
                  {referral.response}
                </p>
                {referral.response_document_path && (
                  <a
                    href={referral.response_document_path}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold mt-1"
                  >
                    <FileText size={11} />
                    Download Response Document ({referral.response_document_path.split('.').pop()?.toUpperCase()})
                  </a>
                )}
              </div>
            ) : isPending ? (
              <div className="border-t border-amber-100 pt-3 flex items-center gap-2">
                <Clock size={12} className="text-amber-500 animate-pulse" />
                <p className="text-[11px] text-amber-600 font-medium italic">
                  Awaiting response from {referral.referred_to?.name}…
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export const ReferralPanel: React.FC<ReferralPanelProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading,
}) => {
  const [selectedReferralUser, setSelectedReferralUser] = useState<number | ''>('');
  const [referralQuery, setReferralQuery] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [responseRemarks, setResponseRemarks] = useState('');
  const [responsePdf, setResponsePdf] = useState<File | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all_users_for_consultation'],
    queryFn: () => budgetApi.allUsers().then((res: any) => res.data),
    enabled: !!user,
  });

  const allReferrals: PRReferral[] = (pr.referrals || []).filter(
    (r: PRReferral) => !r.referral_type || r.referral_type === 'consultation'
  );
  const activeReferral = allReferrals.find((r) => r.status === 'pending');
  const pastReferrals = allReferrals.filter((r) => r.status !== 'pending');
  const isReferralForMe = activeReferral && activeReferral.referred_to?.id === user?.id;
  const isReferralActive = !!activeReferral;

  // Only HOD, Dean, Director, Admin, and Associate Dean can initiate ad-hoc consultations.
  // PI (faculty), DA (verifier_da), and SP (verifier_sp/superintendent) are NOT allowed.
  const REFERRAL_RESTRICTED_GROUPS = new Set(['faculty', 'verifier_da', 'verifier_sp', 'superintendent']);
  const canInitiateReferral = !REFERRAL_RESTRICTED_GROUPS.has(user?.role?.group_key ?? '');

  const handleReferPr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferralUser) { toast.error('Please select a user to refer to'); return; }
    if (!referralQuery.trim()) { toast.error('Please enter the consultation query'); return; }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ referred_to_id: Number(selectedReferralUser), query: referralQuery.trim() }));
      if (queryFile) formData.append('query_document', queryFile);
      await prApi.referPr(pr.id, formData);
      toast.success('Purchase indent referred successfully');
      setSelectedReferralUser('');
      setReferralQuery('');
      setQueryFile(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to refer purchase indent');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseRemarks.trim()) { toast.error('Response remarks are required'); return; }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ response: responseRemarks.trim() }));
      if (responsePdf) formData.append('response_document', responsePdf);
      await prApi.respondReferral(pr.id, formData);
      toast.success('Opinion report submitted successfully');
      setResponseRemarks('');
      setResponsePdf(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to submit response');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-5 text-left">

      {/* ── Active referral: "respond" or "waiting" card ── */}
      {isReferralActive && activeReferral && (
        isReferralForMe ? (
          <div className="card p-6 bg-indigo-50 border-indigo-200 space-y-4">
            <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wide border-b border-indigo-100 pb-2 flex items-center gap-2">
              <Users size={18} className="text-indigo-600" /> Consultation Request
            </h3>
            <div className="bg-white border border-indigo-100 rounded-lg p-4 space-y-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Requested by</p>
              <p className="text-sm text-slate-800 font-medium">
                {activeReferral.referred_by?.name} ({activeReferral.referred_by?.email})
              </p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider pt-2">Query / Context</p>
              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded border border-slate-100 italic">
                "{activeReferral.query}"
              </p>
              {activeReferral.query_document_path && (
                <div className="pt-2">
                  <a href={activeReferral.query_document_path} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                    <Download size={12} /> Download Query Attachment ({activeReferral.query_document_path.split('.').pop()?.toUpperCase()})
                  </a>
                </div>
              )}
            </div>
            <form onSubmit={handleRespondReferral} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Your Feedback / Opinion <span className="text-rose-500">*</span>
                </label>
                <textarea
                  value={responseRemarks}
                  onChange={(e) => setResponseRemarks(e.target.value)}
                  placeholder="Provide your detailed feedback or recommendations..."
                  className="input-field w-full min-h-[100px] bg-white"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Upload Report Document (Optional)</label>
                <input type="file" onChange={(e) => setResponsePdf(e.target.files?.[0] || null)}
                  className="input-field w-full text-slate-600 bg-white text-xs" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="submit" disabled={actionLoading}
                  className="btn-primary py-2.5 px-6 font-semibold shadow-md flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 border-none text-white text-xs">
                  {actionLoading ? 'Submitting…' : 'Submit Consultation & Send Back'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          <div className="card p-6 bg-amber-50/70 border border-amber-200 space-y-3 shadow-sm">
            <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide border-b border-amber-100 pb-2 flex items-center gap-2">
              <Users size={18} className="text-amber-600" /> Awaiting Consultation Response
            </h3>
            <p className="text-xs text-amber-700 font-medium leading-relaxed">
              This purchase indent has been referred to{' '}
              <span className="font-bold text-slate-800">{activeReferral.referred_to?.name} ({activeReferral.referred_to?.email})</span> for an opinion.
            </p>
            <div className="bg-white border border-amber-100 rounded p-3 text-xs text-slate-600 space-y-1">
              <span className="font-semibold text-slate-400">Consultation query:</span>
              <p className="italic">"{activeReferral.query}"</p>
              {activeReferral.query_document_path && (
                <div className="pt-2">
                  <a href={activeReferral.query_document_path} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-semibold">
                    <Download size={12} /> Download Query Attachment ({activeReferral.query_document_path.split('.').pop()?.toUpperCase()})
                  </a>
                </div>
              )}
            </div>
            <p className="text-[11px] text-amber-600 font-semibold bg-amber-100/50 p-2.5 rounded border border-amber-200/50 flex items-center gap-1.5">
              <ShieldAlert size={14} className="text-amber-600 flex-shrink-0" />
              Workflow actions are temporarily frozen until a consultation response is submitted.
            </p>
          </div>
        )
      )}

      {/* ── New referral form (when no active referral) ── */}
      {!isReferralActive && canInitiateReferral && (
        <div className="border-t border-blue-200/60 pt-4 mt-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
            <Users size={14} className="text-slate-500" /> Seek Ad-hoc Consultation (Optional)
          </h4>
          <p className="text-[11px] text-slate-500 font-medium">
            Refer this purchase indent to another user to seek their feedback or opinion. This will temporarily freeze the workflow until they respond.
          </p>
          <form onSubmit={handleReferPr} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultant User</label>
              <select value={selectedReferralUser}
                onChange={(e) => setSelectedReferralUser(e.target.value === '' ? '' : Number(e.target.value))}
                className="input-field text-xs bg-white w-full">
                <option value="">-- Choose User --</option>
                {allUsers.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultation Query / Request Notes</label>
              <input type="text" placeholder="What feedback or report do you need?"
                value={referralQuery} onChange={(e) => setReferralQuery(e.target.value)}
                className="input-field text-xs bg-white w-full" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supporting Document (Optional)</label>
              <input type="file" onChange={(e) => setQueryFile(e.target.files?.[0] || null)}
                className="input-field text-xs text-slate-600 bg-white w-full" />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <button type="submit"
                disabled={actionLoading || !selectedReferralUser || !referralQuery.trim()}
                className="btn-secondary text-xs px-4 py-2.5 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 flex items-center gap-1 font-semibold">
                <Users size={12} /> Refer for Opinion
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Consultation History Thread ── */}
      {allReferrals.length > 0 && (
        <div className="border-t border-slate-200 pt-4 mt-2 space-y-3">
          <button
            type="button"
            onClick={() => setShowHistory((p) => !p)}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 uppercase tracking-wide hover:text-indigo-700 transition-colors"
          >
            <MessageSquare size={14} className="text-indigo-400" />
            Consultation History
            <span className="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1">
              {allReferrals.length}
            </span>
            {showHistory ? <ChevronUp size={13} className="ml-auto text-slate-400" /> : <ChevronDown size={13} className="ml-auto text-slate-400" />}
          </button>

          {showHistory && (
            <div className="space-y-1 pt-1">
              {allReferrals.map((ref, idx) => (
                <ReferralThreadItem key={ref.id} referral={ref} index={idx} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
