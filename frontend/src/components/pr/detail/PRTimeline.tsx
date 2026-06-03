import React from 'react';
import { CheckCircle2, XCircle, Clock, RotateCcw } from 'lucide-react';
import { PurchaseRequest } from '../../../types';

interface PRTimelineProps {
  history: PurchaseRequest['history'];
  currentStatus: string;
}

export const PRTimeline: React.FC<PRTimelineProps> = ({ history = [] }) => {
  return (
    <div className="space-y-4">
      {history.map((h, i) => {
        const isLast = i === history.length - 1;
        const isRejected = h.status.toLowerCase().includes('reject');
        const isSentBack = h.status.toLowerCase().includes('sent back');
        return (
          <div key={h.id} className="flex gap-4 items-start text-left">
            <div className="flex flex-col items-center mt-1">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${isRejected ? 'bg-red-50 border-red-200 text-red-600' : isSentBack ? 'bg-orange-50 border-orange-200 text-orange-600' : isLast ? 'bg-blue-50 border-blue-200 text-[#1a3a6b]' : 'bg-green-50 border-green-200 text-green-600'}`}>
                {isRejected ? <XCircle size={14} /> : isSentBack ? <RotateCcw size={12} /> : isLast ? <Clock size={12} /> : <CheckCircle2 size={14} />}
              </div>
              {i < history.length - 1 && <div className="w-px h-6 bg-slate-200 mt-2" />}
            </div>
            <div className="flex-1 pb-2">
              <div className="text-sm font-bold text-slate-800">{h.status}</div>
              {h.remarks && <div className="text-xs text-slate-600 mt-1 italic">"{h.remarks}"</div>}
              <div className="text-[10px] text-slate-400 mt-1 font-semibold">
                {h.frozen_actor_name && `${h.frozen_actor_name} (${h.frozen_designation || 'Approver'})`}
              </div>
              {h.acted_at && <div className="text-[10px] text-slate-500 mt-0.5 font-medium">{new Date(h.acted_at).toLocaleString()}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
};
