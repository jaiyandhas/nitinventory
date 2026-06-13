import React, { useState } from 'react';
import { CheckCircle2, XCircle, AlertCircle, Info, Calendar, ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';

interface TimelineEvent {
  id: string | number;
  date: Date;
  stage: string;
  action: string;
  actorName: string;
  actorRole: string;
  remarks?: string;
  signatureUrl?: string;
  statusType: 'success' | 'danger' | 'warning' | 'info';
}

interface WorkflowTimelineProps {
  aa?: any;
  pr?: any;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({ aa, pr }) => {
  const [sortDescending, setSortDescending] = useState(true);
  const [expandedRemarks, setExpandedRemarks] = useState<Record<string, boolean>>({});

  const activeAA = aa || pr?.administrative_approval;
  const activePR = pr;

  const events: TimelineEvent[] = [];

  // 1. Gather Budget Allocation Nominee Selection
  const budgetFile = activeAA?.budget_info || activePR?.budget_file;
  if (budgetFile) {
    const budgetCreated = activeAA?.created_at || activePR?.created_at;
    let nomineeDetailsStr = '';
    
    // Check nominees list
    if (activeAA?.nominees && activeAA.nominees.length > 0) {
      nomineeDetailsStr = activeAA.nominees.map((n: any) => n.nominee_name).join(', ');
    } else if (budgetFile.nominee_ids && budgetFile.nominee_ids.length > 0) {
      nomineeDetailsStr = `IDs: ${budgetFile.nominee_ids.join(', ')}`;
    }

    events.push({
      id: 'budget-alloc',
      date: budgetCreated ? new Date(budgetCreated) : new Date(),
      stage: 'Budget Allocation',
      action: 'Nominees Selected',
      actorName: 'HOD',
      actorRole: 'Head of Department',
      remarks: nomineeDetailsStr ? `Technical Committee Nominees configured: ${nomineeDetailsStr}` : 'Budget reference allocated.',
      statusType: 'info',
    });
  }

  // 2. Gather Administrative Approval History
  if (activeAA?.history && Array.isArray(activeAA.history)) {
    activeAA.history.forEach((h: any, idx: number) => {
      let statusType: TimelineEvent['statusType'] = 'info';
      if (h.status === 'Approved' || h.status === 'Submitted') statusType = 'success';
      else if (h.status === 'Returned') statusType = 'warning';
      else if (h.status === 'Rejected') statusType = 'danger';

      events.push({
        id: `aa-hist-${h.id || idx}`,
        date: h.acted_at ? new Date(h.acted_at) : new Date(activeAA.created_at || Date.now()),
        stage: 'Administrative Approval',
        action: h.status,
        actorName: h.approver_name || 'Approver',
        actorRole: h.approver_role || 'System',
        remarks: h.remarks,
        signatureUrl: h.signature_url,
        statusType,
      });
    });
  }

  // 3. Gather AA Nominee Evaluations
  if (activeAA?.nominees && Array.isArray(activeAA.nominees)) {
    activeAA.nominees.forEach((nom: any, idx: number) => {
      if (nom.acted_at && nom.status !== 'Pending') {
        let statusType: TimelineEvent['statusType'] = 'success';
        if (nom.status === 'Returned') statusType = 'warning';
        else if (nom.status === 'Rejected') statusType = 'danger';

        events.push({
          id: `aa-nom-${nom.id || idx}`,
          date: new Date(nom.acted_at),
          stage: 'Nominee Evaluation',
          action: nom.status === 'Approved' ? 'Approved Spec' : nom.status,
          actorName: nom.nominee_name || 'Committee Nominee',
          actorRole: `Nominee (${nom.nominee_dept || 'Expert'})`,
          remarks: nom.remarks,
          signatureUrl: nom.signature_url,
          statusType,
        });
      }
    });
  }

  // 4. Gather Purchase Request History
  if (activePR?.history && Array.isArray(activePR.history)) {
    activePR.history.forEach((h: any, idx: number) => {
      let statusType: TimelineEvent['statusType'] = 'info';
      const statusLower = (h.status || '').toLowerCase();
      if (statusLower === 'approved' || statusLower === 'completed' || statusLower === 'submitted') {
        statusType = 'success';
      } else if (statusLower.includes('returned') || statusLower.includes('send_back') || statusLower.includes('back')) {
        statusType = 'warning';
      } else if (statusLower === 'rejected' || statusLower === 'cancelled') {
        statusType = 'danger';
      }

      events.push({
        id: `pr-hist-${h.id || idx}`,
        date: h.acted_at ? new Date(h.acted_at) : new Date(activePR.created_at || Date.now()),
        stage: h.phase_name || 'Indent Process',
        action: h.status?.toUpperCase() || 'Action',
        actorName: h.approver_name || 'Workflow Actor',
        actorRole: h.approver_role || 'Staff',
        remarks: h.remarks,
        signatureUrl: h.signature_path ? `/static/uploads/${h.signature_path}` : undefined,
        statusType,
      });
    });
  }

  // Deduplicate and filter events with valid dates
  const uniqueEvents = Array.from(new Map(events.map(ev => [ev.id, ev])).values())
    .filter(ev => !isNaN(ev.date.getTime()));

  // Sort events
  uniqueEvents.sort((a, b) => {
    const timeA = a.date.getTime();
    const timeB = b.date.getTime();
    return sortDescending ? timeB - timeA : timeA - timeB;
  });

  const toggleRemarks = (eventId: string | number) => {
    setExpandedRemarks(prev => ({ ...prev, [eventId]: !prev[eventId] }));
  };

  const getStatusIcon = (status: TimelineEvent['statusType']) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 size={16} className="text-emerald-500" />;
      case 'danger':
        return <XCircle size={16} className="text-rose-500" />;
      case 'warning':
        return <AlertCircle size={16} className="text-amber-500" />;
      default:
        return <Info size={16} className="text-blue-500" />;
    }
  };

  return (
    <div className="card bg-white border border-slate-200 shadow-sm p-6 rounded-xl space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Chronological Audit Log</h3>
          <p className="text-slate-500 text-xs mt-0.5">Unified timeline of budget, approval, and purchase steps.</p>
        </div>
        <button
          onClick={() => setSortDescending(!sortDescending)}
          className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 border-slate-200 hover:bg-slate-50 text-slate-600 transition"
        >
          <ArrowUpDown size={13} />
          {sortDescending ? 'Newest First' : 'Oldest First'}
        </button>
      </div>

      {uniqueEvents.length === 0 ? (
        <div className="text-center py-8 text-slate-400 text-sm font-medium italic">
          No workflow actions logged yet.
        </div>
      ) : (
        <div className="flow-root pt-2">
          <ul className="-mb-8">
            {uniqueEvents.map((event, idx) => {
              const isLast = idx === uniqueEvents.length - 1;
              const hasLongRemarks = event.remarks && event.remarks.length > 80;
              const isExpanded = expandedRemarks[event.id] || false;
              const displayRemarks = hasLongRemarks && !isExpanded 
                ? `${event.remarks?.slice(0, 80)}...`
                : event.remarks;

              return (
                <li key={event.id}>
                  <div className="relative pb-8">
                    {!isLast && (
                      <span className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-100" aria-hidden="true" />
                    )}
                    <div className="relative flex space-x-3 items-start">
                      <div>
                        <span className="h-8 w-8 rounded-full bg-slate-50 border border-slate-200/60 flex items-center justify-center ring-8 ring-white shrink-0">
                          {getStatusIcon(event.statusType)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0 pt-1.5 flex flex-col sm:flex-row justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-800">
                              {event.actorName}
                            </span>
                            <span className="text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded font-semibold border border-slate-200/40">
                              {event.actorRole}
                            </span>
                            <span className="text-[10px] text-slate-400 font-medium font-sans">
                              · {event.stage}
                            </span>
                          </div>
                          <p className="text-xs text-slate-900 mt-1">
                            Action: <span className="font-semibold uppercase text-slate-700">{event.action}</span>
                          </p>
                          {event.remarks && event.remarks !== '-' && (
                            <div className="mt-1">
                              <p className="text-xs text-slate-500 font-medium italic inline leading-relaxed bg-slate-50/50 p-1 px-1.5 rounded border border-slate-100">
                                Remarks: {displayRemarks}
                              </p>
                              {hasLongRemarks && (
                                <button
                                  onClick={() => toggleRemarks(event.id)}
                                  className="text-[10px] text-[#1a3a6b] hover:underline ml-1.5 font-bold align-middle inline-flex items-center"
                                >
                                  {isExpanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                                </button>
                              )}
                            </div>
                          )}

                          {event.signatureUrl && (
                            <div className="mt-2.5 flex items-center gap-2">
                              <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider">Digital Sign:</span>
                              <img 
                                src={event.signatureUrl} 
                                alt="Signature" 
                                className="h-6 object-contain max-w-[120px] bg-slate-50 border border-slate-100 p-0.5 rounded opacity-90"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            </div>
                          )}
                        </div>
                        <div className="text-left sm:text-right text-[10px] text-slate-400 font-semibold font-mono flex items-center gap-1 sm:justify-end shrink-0 mt-0.5 sm:mt-0">
                          <Calendar size={11} className="text-slate-300" />
                          {event.date.toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
