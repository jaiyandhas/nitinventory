import React, { useState } from 'react';
import {
  MessageSquareMore, Send, CheckCircle2, Clock, ChevronDown, ChevronUp, FileText, Download,
} from 'lucide-react';
import { prApi } from '../../../services/api';
import { PRReferral } from '../../../types';
import toast from 'react-hot-toast';

interface ClarificationPanelProps {
  pr: any;
  user: any;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (v: boolean) => void;
}

function formatDT(dt: string | null) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getInitials(name?: string) {
  if (!name) return '?';
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

// Single thread item showing one query + its response (or awaiting state)
function ClarificationItem({ item, index, me, prId, refetch, setActionLoading }: {
  item: PRReferral;
  index: number;
  me: any;
  prId: number;
  refetch: () => void;
  setActionLoading: (v: boolean) => void;
}) {
  const [open, setOpen] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isPending = item.status === 'pending';
  const isMyTurnToReply = isPending && item.referred_to?.id === me?.id;

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim()) { toast.error('Please enter a reply'); return; }
    setSubmitting(true);
    setActionLoading(true);
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ response: replyText.trim() }));
      if (replyFile) fd.append('response_document', replyFile);
      await prApi.respondClarification(prId, item.id, fd);
      toast.success('Reply sent!');
      setReplyText('');
      setReplyFile(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to submit reply');
    } finally {
      setSubmitting(false);
      setActionLoading(false);
    }
  };

  return (
    <div className="relative pl-10">
      {/* Thread line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-violet-200 via-slate-100 to-transparent" />

      {/* Avatar */}
      <div className={`absolute left-0 top-1 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shadow border-2
        ${isPending ? 'bg-violet-100 border-violet-300 text-violet-700' : 'bg-teal-100 border-teal-300 text-teal-700'}`}>
        {getInitials(item.referred_by?.name)}
      </div>

      <div className={`rounded-xl border shadow-sm mb-4 overflow-hidden
        ${isPending ? 'border-violet-200' : 'border-teal-100'}`}>

        {/* Header */}
        <button
          type="button"
          onClick={() => setOpen(p => !p)}
          className={`w-full flex items-center justify-between px-4 py-2.5 text-left
            ${isPending ? 'bg-violet-50' : 'bg-teal-50/70'}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full
              ${isPending
                ? 'bg-violet-100 text-violet-700 border border-violet-200'
                : 'bg-teal-100 text-teal-700 border border-teal-200'}`}>
              {isPending
                ? <span className="flex items-center gap-1"><Clock size={9} /> Awaiting Reply</span>
                : <span className="flex items-center gap-1"><CheckCircle2 size={9} /> Replied</span>}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Round #{index + 1}</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] text-slate-500">{formatDT(item.created_at)}</span>
          </div>
          <span className="text-slate-400 ml-2">
            {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>

        {open && (
          <div className="p-4 space-y-4">
            {/* Query */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Send size={11} className="text-violet-500 rotate-[315deg]" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Query — {item.referred_by?.name || 'Unknown'}
                  <span className="font-normal ml-1 normal-case">to</span> {item.referred_to?.name || 'Unknown'}
                </span>
              </div>
              <p className="text-xs text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2.5 italic leading-relaxed">
                "{item.query}"
              </p>
              {item.query_document_path && (
                <a href={item.query_document_path} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-[11px] text-violet-600 hover:text-violet-800 font-semibold mt-1">
                  <FileText size={11} />
                  Download Attachment ({item.query_document_path.split('.').pop()?.toUpperCase()})
                </a>
              )}
            </div>

            {/* Response or reply form */}
            {item.status === 'responded' && item.response ? (
              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={11} className="text-teal-500" />
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Reply — {item.referred_to?.name || 'Unknown'}
                    <span className="text-[10px] text-slate-300 font-normal ml-1.5">· {formatDT(item.responded_at)}</span>
                  </span>
                </div>
                <p className="text-xs text-slate-700 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5 leading-relaxed">
                  {item.response}
                </p>
                {item.response_document_path && (
                  <a href={item.response_document_path} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-teal-700 hover:text-teal-900 font-semibold mt-1">
                    <Download size={11} /> Download Reply Document
                  </a>
                )}
              </div>
            ) : isMyTurnToReply ? (
              <form onSubmit={handleReply} className="border-t border-violet-100 pt-3 space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Your Reply <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder="Enter your clarification response..."
                    className="input-field w-full min-h-[80px] bg-white text-xs"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Attachment (optional)
                  </label>
                  <input type="file" onChange={e => setReplyFile(e.target.files?.[0] || null)}
                    className="input-field w-full text-xs text-slate-600 bg-white" />
                </div>
                <div className="flex justify-end">
                  <button type="submit" disabled={submitting || !replyText.trim()}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 border-none text-white">
                    <Send size={12} /> {submitting ? 'Sending…' : 'Send Reply'}
                  </button>
                </div>
              </form>
            ) : isPending ? (
              <div className="border-t border-violet-100 pt-3 flex items-center gap-2">
                <Clock size={12} className="text-violet-500 animate-pulse" />
                <p className="text-[11px] text-violet-600 font-medium italic">
                  Awaiting reply from {item.referred_to?.name}…
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

export const ClarificationPanel: React.FC<ClarificationPanelProps> = ({
  pr, user, refetch, actionLoading, setActionLoading,
}) => {
  const [queryText, setQueryText] = useState('');
  const [queryFile, setQueryFile] = useState<File | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const allReferrals: PRReferral[] = pr.referrals || [];
  const clarifications = allReferrals.filter(r => r.referral_type === 'clarification');

  // Determine if the current user can send a new clarification
  const isSuperintendent = ['superintendent', 'verifier_sp'].includes(user?.role?.group_key || '');
  const isInitiator = user?.id === pr.initiator_id;
  const canSend = isSuperintendent || isInitiator;

  // Check if we are in tendering phase
  const inTendering = pr.flow?.phase_name === 'Tendering';
  if (!inTendering) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryText.trim()) { toast.error('Please enter your query'); return; }
    setSubmitting(true);
    setActionLoading(true);
    try {
      const fd = new FormData();
      fd.append('payload', JSON.stringify({ query: queryText.trim() }));
      if (queryFile) fd.append('query_document', queryFile);
      await prApi.clarifyPr(pr.id, fd);
      toast.success('Clarification sent!');
      setQueryText('');
      setQueryFile(null);
      refetch();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send clarification');
    } finally {
      setSubmitting(false);
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-4 text-left">
      {/* Section header */}
      <div className="flex items-center justify-between border-t border-violet-100 pt-4 mt-2">
        <div className="flex items-center gap-2">
          <MessageSquareMore size={15} className="text-violet-500" />
          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
            Technical Clarification
            <span className="ml-1.5 text-[10px] font-normal normal-case text-slate-400">
              (PI ↔ Superintendent)
            </span>
          </h4>
          {clarifications.length > 0 && (
            <span className="bg-violet-100 text-violet-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {clarifications.length}
            </span>
          )}
        </div>
        {clarifications.length > 0 && (
          <button type="button" onClick={() => setShowHistory(p => !p)}
            className="text-xs text-slate-400 hover:text-violet-600 flex items-center gap-1">
            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      <p className="text-[11px] text-slate-500 font-medium -mt-2">
        Use this channel to exchange technical queries between the Purchase Initiator and Superintendent.
        This does <strong>not</strong> freeze the workflow.
      </p>

      {/* Thread history */}
      {clarifications.length > 0 && showHistory && (
        <div className="space-y-1 pt-1">
          {clarifications.map((item, idx) => (
            <ClarificationItem
              key={item.id}
              item={item}
              index={idx}
              me={user}
              prId={pr.id}
              refetch={refetch}
              setActionLoading={setActionLoading}
            />
          ))}
        </div>
      )}

      {/* New query form */}
      {canSend && (
        <form onSubmit={handleSend}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-violet-200 p-4 rounded-lg shadow-xs">
          <div className="sm:col-span-2 space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              {isSuperintendent ? 'Query to Purchase Initiator' : 'Query to Superintendent'}
              <span className="text-rose-500 ml-0.5">*</span>
            </label>
            <textarea
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              placeholder="Type your technical question or clarification request..."
              className="input-field w-full bg-white text-xs min-h-[70px]"
              required
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
              Attachment (optional)
            </label>
            <input type="file" onChange={e => setQueryFile(e.target.files?.[0] || null)}
              className="input-field w-full text-xs text-slate-600 bg-white" />
          </div>
          <div className="flex items-end justify-end">
            <button
              type="submit"
              disabled={submitting || actionLoading || !queryText.trim()}
              className="btn-secondary text-xs px-4 py-2.5 border-violet-200 text-violet-700
                bg-violet-50/50 hover:bg-violet-100 flex items-center gap-1.5 font-semibold">
              <MessageSquareMore size={12} />
              {submitting ? 'Sending…' : 'Send Clarification'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
