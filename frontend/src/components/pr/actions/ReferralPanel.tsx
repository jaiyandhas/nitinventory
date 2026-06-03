import React, { useState } from 'react';
import { Users, Download, ShieldAlert } from 'lucide-react';
import { prApi, budgetApi } from '../../../services/api';
import { PurchaseRequest } from '../../../types';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';

interface ReferralPanelProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
}

export const ReferralPanel: React.FC<ReferralPanelProps> = ({
  pr,
  user,
  refetch,
  actionLoading,
  setActionLoading
}) => {
  const [selectedReferralUser, setSelectedReferralUser] = useState<number | ''>('');
  const [referralQuery, setReferralQuery] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [responseRemarks, setResponseRemarks] = useState('');
  const [responsePdf, setResponsePdf] = useState<File | null>(null);

  // Fetch all users for consultation
  const { data: allUsers = [] } = useQuery({
    queryKey: ['all_users_for_consultation'],
    queryFn: () => budgetApi.allUsers().then((res: any) => res.data),
    enabled: !!user,
  });

  const activeReferral = pr.referrals?.find((r: any) => r.status === 'pending');
  const isReferralForMe = activeReferral && activeReferral.referred_to?.id === user?.id;
  const isReferralActive = !!activeReferral;

  const handleReferPr = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedReferralUser) {
      toast.error('Please select a user to refer to');
      return;
    }
    if (!referralQuery.trim()) {
      toast.error('Please enter the consultation query');
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({
        referred_to_id: Number(selectedReferralUser),
        query: referralQuery.trim(),
      }));
      if (queryFile) {
        formData.append('query_document', queryFile);
      }
      await prApi.referPr(pr.id, formData);
      toast.success('Purchase request referred successfully');
      setSelectedReferralUser('');
      setReferralQuery('');
      setQueryFile(null);
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to refer purchase request');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRespondReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responseRemarks.trim()) {
      toast.error('Response remarks are required');
      return;
    }
    setActionLoading(true);
    try {
      const formData = new FormData();
      formData.append('payload', JSON.stringify({ response: responseRemarks.trim() }));
      if (responsePdf) {
        formData.append('response_document', responsePdf);
      }
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

  if (isReferralActive) {
    if (isReferralForMe) {
      return (
        <div className="card p-6 bg-indigo-50 border-indigo-200 space-y-4 text-left">
          <h3 className="text-sm font-bold text-indigo-905 uppercase tracking-wide border-b border-indigo-100 pb-2 flex items-center gap-2">
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
                <a
                  href={activeReferral.query_document_path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-semibold"
                >
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
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Upload Report Document (Optional)
              </label>
              <input
                type="file"
                onChange={(e) => setResponsePdf(e.target.files?.[0] || null)}
                className="input-field w-full text-slate-600 bg-white text-xs"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={actionLoading}
                className="btn-primary py-2.5 px-6 font-semibold shadow-md flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 border-none text-white text-xs"
              >
                {actionLoading ? 'Submitting...' : 'Submit Consultation & Send Back'}
              </button>
            </div>
          </form>
        </div>
      );
    } else {
      return (
        <div className="card p-6 bg-amber-50/70 border border-amber-200 space-y-3 text-left shadow-sm">
          <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wide border-b border-amber-100 pb-2 flex items-center gap-2">
            <Users size={18} className="text-amber-600" /> Awaiting Consultation Response
          </h3>
          <p className="text-xs text-amber-700 font-medium leading-relaxed">
            This purchase request has been referred to <span className="font-bold text-slate-800">{activeReferral.referred_to?.name} ({activeReferral.referred_to?.email})</span> for an opinion.
          </p>
          <div className="bg-white border border-amber-100 rounded p-3 text-xs text-slate-600 space-y-1">
            <span className="font-semibold text-slate-400">Consultation query:</span>
            <p className="italic">"{activeReferral.query}"</p>
            {activeReferral.query_document_path && (
              <div className="pt-2">
                <a
                  href={activeReferral.query_document_path}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-amber-700 hover:text-amber-900 font-semibold"
                >
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
      );
    }
  }

  return (
    <div className="border-t border-blue-200/60 pt-4 mt-4 space-y-3 text-left">
      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
        <Users size={14} className="text-slate-500" /> Seek Ad-hoc Consultation (Optional)
      </h4>
      <p className="text-[11px] text-slate-500 font-medium">
        Refer this purchase request to another user to seek their feedback or opinion. This will temporarily freeze the workflow until they respond.
      </p>
      <form onSubmit={handleReferPr} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end bg-white border border-slate-200 p-5 rounded-lg shadow-xs">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultant User</label>
          <select
            value={selectedReferralUser}
            onChange={(e) => setSelectedReferralUser(e.target.value === '' ? '' : Number(e.target.value))}
            className="input-field text-xs bg-white w-full"
          >
            <option value="">-- Choose User --</option>
            {allUsers.map((u: any) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Consultation Query / Request Notes</label>
          <input
            type="text"
            placeholder="What feedback or report do you need?"
            value={referralQuery}
            onChange={(e) => setReferralQuery(e.target.value)}
            className="input-field text-xs bg-white w-full"
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Supporting Document (Optional)</label>
          <input
            type="file"
            onChange={(e) => setQueryFile(e.target.files?.[0] || null)}
            className="input-field text-xs text-slate-600 bg-white w-full"
          />
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={actionLoading || !selectedReferralUser || !referralQuery.trim()}
            className="btn-secondary text-xs px-4 py-2.5 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 flex items-center gap-1 font-semibold"
          >
            <Users size={12} /> Refer for Opinion
          </button>
        </div>
      </form>
    </div>
  );
};
