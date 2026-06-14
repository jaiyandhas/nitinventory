import React from 'react';
import { Check, Clock, AlertTriangle, Play, HelpCircle, Layers, User, Calendar } from 'lucide-react';

interface Stage {
  name: string;
  description: string;
  status: 'completed' | 'current' | 'pending' | 'rejected' | 'returned';
  date?: string;
  actor?: string;
}

interface WorkflowTrackerProps {
  aa?: any;
  pr?: any;
}

export const WorkflowTracker: React.FC<WorkflowTrackerProps> = ({ aa, pr }) => {
  const activeAA = aa || pr?.administrative_approval;
  const activePR = pr;

  // Helper to format ISO dates nicely
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return undefined;
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return undefined;
    }
  };

  // Helper to format ISO dates with time
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return undefined;
    try {
      return new Date(dateStr).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return undefined;
    }
  };

  // ==========================================
  // LEVEL 1 – Procurement Lifecycle (7 Stages)
  // ==========================================
  const level1Stages: Stage[] = [];

  // Stage 1: Administrative Approval

  let aaStatus: Stage['status'] = 'pending';
  let aaDate: string | undefined;
  let aaActor: string | undefined;

  if (activeAA) {
    if (activeAA.status === 'Administrative Approval Granted') {
      aaStatus = 'completed';
      const dirApproved = activeAA.history?.find((h: any) => h.status === 'Approved' && h.approver_role?.toLowerCase().includes('director'));
      aaDate = formatDate(dirApproved?.acted_at || activeAA.updated_at);
      aaActor = dirApproved?.approver_name || 'Director';
    } else if (activeAA.status === 'Rejected') {
      aaStatus = 'rejected';
      const rejected = activeAA.history?.find((h: any) => h.status === 'Rejected');
      aaDate = formatDate(rejected?.acted_at || activeAA.updated_at);
      aaActor = rejected?.approver_name;
    } else if (activeAA.status === 'Returned' || activeAA.pending_with === 'PI') {
      aaStatus = 'returned';
      const returned = activeAA.history?.find((h: any) => h.status === 'Returned');
      aaDate = formatDate(returned?.acted_at || activeAA.updated_at);
      aaActor = returned?.approver_name;
    } else {
      aaStatus = 'current';
      aaActor = activeAA.pending_with;
    }
  } else if (activePR) {
    aaStatus = 'completed';
  }

  level1Stages.push({
    name: 'Administrative Approval',
    description: 'Admin approvals and internal technical committee nominee reviews.',
    status: aaStatus,
    date: aaDate,
    actor: aaActor,
  });

  // Stage 3: Indent & Technical Specifications
  let indentStatus: Stage['status'] = 'pending';
  let indentDate: string | undefined;
  let indentActor: string | undefined;

  if (activePR) {
    const phaseName = activePR.flow?.phase_name;
    const isCompleted = activePR.current_status === 'completed';
    const isRejected = activePR.current_status === 'rejected';

    if (isCompleted || isRejected) {
      indentStatus = 'completed';
    } else if (phaseName === 'Indent and Detailed Tech Specification' || phaseName === 'Administrative Approval') {
      indentStatus = 'current';
      indentActor = activePR.pending_role || 'Purchase Initiator';
    } else {
      indentStatus = 'completed';
      const submitted = activePR.history?.find((h: any) => h.status === 'submitted' || h.status === 'forwarded');
      indentDate = formatDate(submitted?.acted_at || activePR.created_at);
      indentActor = activePR.initiator?.name;
    }
  } else if (activeAA?.status === 'Administrative Approval Granted') {
    indentStatus = 'current';
    indentActor = 'Purchase Initiator (Not Initiated)';
  }

  level1Stages.push({
    name: 'Indent & Technical Specifications',
    description: 'Purchase Initiator creates purchase request form and uploads specifications.',
    status: indentStatus,
    date: indentDate,
    actor: indentActor,
  });

  // Stage 4: Tendering
  let tenderingStatus: Stage['status'] = 'pending';
  let tenderingDate: string | undefined;
  let tenderingActor: string | undefined;

  if (activePR) {
    const phaseName = activePR.flow?.phase_name;
    const isCompleted = activePR.current_status === 'completed';

    if (isCompleted) {
      tenderingStatus = 'completed';
    } else if (phaseName === 'Tendering') {
      tenderingStatus = 'current';
      tenderingActor = activePR.pending_role;
    } else if (phaseName && ['Technical Evaluation', 'Financial Sanction', 'Purchase Order'].includes(phaseName)) {
      tenderingStatus = 'completed';
      const tenderingHist = activePR.history?.find((h: any) => h.phase_name === 'Tendering' && h.status === 'approved');
      tenderingDate = formatDate(tenderingHist?.acted_at);
    }
  }

  level1Stages.push({
    name: 'Tendering',
    description: 'Procurement section publishes tender or processes local purchase selection.',
    status: tenderingStatus,
    date: tenderingDate,
    actor: tenderingActor,
  });

  // Stage 5: Technical Evaluation
  let teStatus: Stage['status'] = 'pending';
  let teDate: string | undefined;
  let teActor: string | undefined;

  if (activePR) {
    const phaseName = activePR.flow?.phase_name;
    const isCompleted = activePR.current_status === 'completed';

    if (isCompleted) {
      teStatus = 'completed';
    } else if (phaseName === 'Technical Evaluation') {
      teStatus = 'current';
      teActor = activePR.pending_role || 'Technical Committee';
    } else if (phaseName && ['Financial Sanction', 'Purchase Order'].includes(phaseName)) {
      teStatus = 'completed';
      const teHist = activePR.history?.find((h: any) => h.phase_name === 'Technical Evaluation' && h.status === 'approved');
      teDate = formatDate(teHist?.acted_at);
    }
  }

  level1Stages.push({
    name: 'Technical Evaluation',
    description: 'Expert committee reviews submitted technical bids and signs evaluation report.',
    status: teStatus,
    date: teDate,
    actor: teActor,
  });

  // Stage 6: Financial Evaluation
  let feStatus: Stage['status'] = 'pending';
  let feDate: string | undefined;
  let feActor: string | undefined;

  if (activePR) {
    const phaseName = activePR.flow?.phase_name;
    const isCompleted = activePR.current_status === 'completed';

    if (isCompleted) {
      feStatus = 'completed';
    } else if (phaseName === 'Financial Sanction' || phaseName === 'Financial Evaluation') {
      feStatus = 'current';
      feActor = activePR.pending_role || 'Purchase Committee';
    } else if (phaseName === 'Purchase Order') {
      feStatus = 'completed';
      const feHist = activePR.history?.find((h: any) => h.phase_name === 'Financial Sanction' && h.status === 'approved');
      feDate = formatDate(feHist?.acted_at);
    }
  }

  level1Stages.push({
    name: 'Financial Evaluation',
    description: 'Dean/Director reviews financial comparative sheets and grants sanction.',
    status: feStatus,
    date: feDate,
    actor: feActor,
  });

  // Stage 7: Purchase Order
  let poStatus: Stage['status'] = 'pending';
  let poDate: string | undefined;
  let poActor: string | undefined;

  if (activePR) {
    const phaseName = activePR.flow?.phase_name;
    const isCompleted = activePR.current_status === 'completed';
    const isCancelled = activePR.current_status === 'cancelled';

    if (isCompleted) {
      poStatus = 'completed';
      const poHist = activePR.history?.find((h: any) => h.phase_name === 'Purchase Order' && h.status === 'completed');
      poDate = formatDate(poHist?.acted_at);
    } else if (isCancelled) {
      poStatus = 'rejected';
      poDate = formatDate(activePR.updated_at);
    } else if (phaseName === 'Purchase Order' || activePR.current_status === 'po_issued') {
      poStatus = 'current';
      poActor = activePR.pending_role || 'Superintendent';
    }
  }

  level1Stages.push({
    name: 'Purchase Order',
    description: 'Official purchase order generation, delivery logging, and final billing.',
    status: poStatus,
    date: poDate,
    actor: poActor,
  });

  // ========================================================
  // LEVEL 2 – Administrative Approval Progress (Internal Steps)
  // ========================================================
  const level2Steps: Stage[] = [];
  const hasLevel2 = !!activeAA;

  if (activeAA) {
    // Step 1: PI Submission
    level2Steps.push({
      name: 'Initiated (PI)',
      description: 'Request submitted for approvals.',
      status: 'completed',
      date: formatDate(activeAA.created_at),
      actor: activeAA.pi_name,
    });

    // Step 2: HOD Review
    let hodStepStatus: Stage['status'] = 'pending';
    let hodStepDate: string | undefined;
    if (activeAA.status === 'Returned' && activeAA.pending_with === 'HOD') {
      hodStepStatus = 'returned';
    } else if (activeAA.pending_with === 'HOD') {
      hodStepStatus = 'current';
    } else if (activeAA.pending_with && activeAA.pending_with !== 'HOD') {
      hodStepStatus = 'completed';
      const hodHist = activeAA.history?.find((h: any) => h.status === 'Forwarded' || h.approver_role?.toLowerCase().includes('hod'));
      hodStepDate = formatDate(hodHist?.acted_at);
    }
    level2Steps.push({
      name: 'HOD Approval',
      description: 'Departmental validation and forwarding.',
      status: hodStepStatus,
      date: hodStepDate,
      actor: activeAA.pi_department_name || 'HOD',
    });

    // Step 3: Nominee Reviews
    let nomineeStepStatus: Stage['status'] = 'pending';
    let nomineeStepDesc = 'Technical Committee Nominees spec evaluations.';
    const nominees = activeAA.nominees || [];
    const hasNominees = nominees.length > 0;

    if (hasNominees) {
      const pendingNom = nominees.find((n: any) => n.status === 'Pending');
      const returnedNom = nominees.find((n: any) => n.status === 'Returned');
      
      if (activeAA.status === 'Administrative Approval Granted') {
        nomineeStepStatus = 'completed';
      } else if (activeAA.pending_with?.toLowerCase().includes('nominee') || pendingNom) {
        nomineeStepStatus = 'current';
        const completedCount = nominees.filter((n: any) => n.status === 'Approved').length;
        nomineeStepDesc = `Evaluation in progress: ${completedCount}/${nominees.length} approved.`;
      } else if (returnedNom) {
        nomineeStepStatus = 'returned';
        nomineeStepDesc = `Returned by Nominee: ${returnedNom.nominee_name}`;
      } else if (nominees.every((n: any) => n.status === 'Approved')) {
        nomineeStepStatus = 'completed';
      }
    } else if (activeAA.pending_with === 'HOD') {
      nomineeStepStatus = 'pending';
      nomineeStepDesc = 'Nominees to be selected by HOD.';
    }

    level2Steps.push({
      name: 'Technical Nominees Review',
      description: nomineeStepDesc,
      status: nomineeStepStatus,
      actor: nominees.map((n: any) => `${n.nominee_name} (${n.status})`).join(', ') || 'Awaiting assignment',
    });

    // Step 4: ADPD Signoff
    let adpdStepStatus: Stage['status'] = 'pending';
    let adpdStepDate: string | undefined;
    const adpdHist = activeAA.history?.find((h: any) => h.approver_role?.toLowerCase().includes('adpd'));
    if (activeAA.pending_with === 'ADPD') {
      adpdStepStatus = 'current';
    } else if (adpdHist || ['Director', 'Administrative Approval Granted'].includes(activeAA.status) || (activeAA.pending_with && !['HOD', 'ADPD', 'PI'].includes(activeAA.pending_with))) {
      adpdStepStatus = 'completed';
      adpdStepDate = formatDate(adpdHist?.acted_at);
    }
    level2Steps.push({
      name: 'ADPD Signoff',
      description: 'Associate Dean P&D budget verification.',
      status: adpdStepStatus,
      date: adpdStepDate,
    });

    // Step 4.5: Dean Approval
    let deanStepStatus: Stage['status'] = 'pending';
    let deanStepDate: string | undefined;
    const deanHist = activeAA.history?.find((h: any) => h.approver_role?.toLowerCase().includes('dean') && !h.approver_role?.toLowerCase().includes('adpd'));
    if (activeAA.pending_with?.toLowerCase() === 'dean_pd' || activeAA.pending_with?.toLowerCase() === 'dean') {
      deanStepStatus = 'current';
    } else if (deanHist || ['Director', 'Administrative Approval Granted'].includes(activeAA.status) || (activeAA.pending_with && !['HOD', 'ADPD', 'PI', 'Dean'].includes(activeAA.pending_with))) {
      deanStepStatus = 'completed';
      deanStepDate = formatDate(deanHist?.acted_at);
    }
    level2Steps.push({
      name: 'Dean Approval',
      description: 'Dean P&D policy compliance review.',
      status: deanStepStatus,
      date: deanStepDate,
    });

    // Step 4.6: Internal Auditor Signoff
    let iaStepStatus: Stage['status'] = 'pending';
    let iaStepDate: string | undefined;
    const iaHist = activeAA.history?.find((h: any) => h.approver_role?.toLowerCase().includes('ia') || h.approver_role?.toLowerCase().includes('audit'));
    if (activeAA.pending_with?.toLowerCase() === 'ia' || activeAA.pending_with?.toLowerCase().includes('audit')) {
      iaStepStatus = 'current';
    } else if (iaHist || ['Director', 'Administrative Approval Granted'].includes(activeAA.status) || (activeAA.pending_with && !['HOD', 'ADPD', 'PI', 'Dean', 'IA', 'Audit'].includes(activeAA.pending_with))) {
      iaStepStatus = 'completed';
      iaStepDate = formatDate(iaHist?.acted_at);
    }
    level2Steps.push({
      name: 'Internal Auditor Signoff',
      description: 'Internal Audit (IA) pre-audit scrutiny.',
      status: iaStepStatus,
      date: iaStepDate,
    });

    // Step 5: Director Approval
    let dirStepStatus: Stage['status'] = 'pending';
    let dirStepDate: string | undefined;
    if (activeAA.status === 'Administrative Approval Granted') {
      dirStepStatus = 'completed';
      const dirHist = activeAA.history?.find((h: any) => h.status === 'Approved' && h.approver_role?.toLowerCase().includes('director'));
      dirStepDate = formatDate(dirHist?.acted_at || activeAA.updated_at);
    } else if (activeAA.pending_with === 'Director') {
      dirStepStatus = 'current';
    } else if (activeAA.status === 'Rejected') {
      dirStepStatus = 'rejected';
      dirStepDate = formatDate(activeAA.updated_at);
    }
    level2Steps.push({
      name: 'Director Approval',
      description: 'Final administrative sanction.',
      status: dirStepStatus,
      date: dirStepDate,
    });
  }

  // ==========================================
  // METADATA SUMMARY BLOCK
  // ==========================================
  const getMetadata = () => {
    let currentStage = 'Administrative Approval';
    let pendingWithUser = '-';
    let pendingWithRole = '-';
    let approvalDate = '-';
    let pendingSinceDate = '-';

    // Current Stage
    if (activePR) {
      if (activePR.current_status === 'completed') {
        currentStage = 'Purchase Completed';
      } else if (activePR.current_status === 'po_issued') {
        currentStage = 'Purchase Order Issued';
      } else {
        currentStage = activePR.flow?.phase_name || 'Indent Process';
      }
    } else if (activeAA) {
      currentStage = `Administrative Approval (${activeAA.status || 'Pending'})`;
    }

    // Pending With Role / User
    if (activePR && activePR.current_status !== 'completed' && activePR.current_status !== 'po_issued') {
      pendingWithRole = activePR.flow?.expected_role_name || activePR.flow?.expected_group || 'System';
      pendingWithUser = activePR.flow?.expected_user?.name || '-';
    } else if (activeAA && activeAA.status !== 'Administrative Approval Granted' && activeAA.status !== 'Rejected') {
      pendingWithRole = activeAA.pending_with || 'HOD/Dean/Director';
      if (activeAA.pending_with?.toLowerCase().includes('nominee')) {
        const pendingNoms = activeAA.nominees?.filter((n: any) => n.status === 'Pending').map((n: any) => n.nominee_name);
        pendingWithUser = pendingNoms && pendingNoms.length > 0 ? pendingNoms.join(', ') : 'Committee Nominees';
      }
    }

    // Approval Date
    if (activePR && activePR.current_status === 'completed') {
      const compHist = activePR.history?.find((h: any) => h.status?.toLowerCase() === 'completed' || h.status?.toLowerCase().includes('completed'));
      approvalDate = formatDateTime(compHist?.acted_at || activePR.updated_at) || '-';
    } else if (activeAA && activeAA.status === 'Administrative Approval Granted') {
      approvalDate = formatDateTime(activeAA.updated_at) || '-';
    }

    // Pending Since Date
    if (activePR && !['completed', 'po_issued', 'rejected', 'cancelled'].includes(activePR.current_status)) {
      pendingSinceDate = formatDateTime(activePR.flow?.created_at || activePR.updated_at) || '-';
    } else if (activeAA && activeAA.status !== 'Administrative Approval Granted' && activeAA.status !== 'Rejected') {
      pendingSinceDate = formatDateTime(activeAA.updated_at) || '-';
    }

    return { currentStage, pendingWithUser, pendingWithRole, approvalDate, pendingSinceDate };
  };

  const metadata = getMetadata();

  const getStatusIcon = (status: Stage['status']) => {
    switch (status) {
      case 'completed':
        return <Check size={12} className="text-emerald-600" />;
      case 'current':
        return <Play size={12} className="fill-blue-600 text-blue-600" />;
      case 'returned':
        return <AlertTriangle size={12} className="text-amber-600" />;
      case 'rejected':
        return <HelpCircle size={12} className="text-rose-600" />;
      default:
        return <Clock size={12} className="text-slate-400" />;
    }
  };

  const getStatusClasses = (status: Stage['status']) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-600 border-emerald-250';
      case 'current':
        return 'bg-blue-50 text-blue-600 border-blue-200 ring-4 ring-blue-100 animate-pulse';
      case 'returned':
        return 'bg-amber-50 text-amber-600 border-amber-250';
      case 'rejected':
        return 'bg-rose-50 text-rose-600 border-rose-250';
      default:
        return 'bg-slate-50 text-slate-400 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* LEVEL 1: Procurement Lifecycle */}
      <div className="card bg-white border border-slate-200 shadow-sm p-6 rounded-xl text-left space-y-5">
        <div>
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-[#1a3a6b]" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Level 1 - Procurement Lifecycle</h3>
          </div>
          <p className="text-slate-500 text-xs mt-0.5 font-medium">Standard 7-stage institutional procurement stages.</p>
        </div>

        <div className="relative pl-6 border-l border-slate-100 space-y-6">
          {level1Stages.map((stage, idx) => (
            <div key={idx} className="relative flex gap-4 items-start">
              {/* Stepper Dot */}
              <div className={`absolute -left-[37px] top-1 w-5 h-5 rounded-full border flex items-center justify-center bg-white ${getStatusClasses(stage.status)}`}>
                {getStatusIcon(stage.status)}
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap justify-between items-start gap-1">
                  <span className={`text-xs font-bold ${stage.status === 'current' ? 'text-blue-700 font-extrabold' : 'text-slate-700'}`}>
                    {stage.name}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusClasses(stage.status)}`}>
                      {stage.status === 'current' ? 'In Progress' : stage.status === 'completed' ? 'Completed' : stage.status.toUpperCase()}
                    </span>
                    {stage.date && (
                      <span className="text-[10px] text-slate-400 font-semibold font-mono">
                        {stage.date}
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed font-medium">{stage.description}</p>
                {stage.actor && stage.status !== 'pending' && (
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">
                    {stage.status === 'completed' ? 'Acted by:' : 'Pending with:'}{' '}
                    <span className="text-slate-600">{stage.actor}</span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* LEVEL 2: Administrative Approval Progress */}
      {hasLevel2 && (
        <div className="card bg-white border border-slate-200 shadow-sm p-6 rounded-xl text-left space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-[#1a3a6b]" />
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Level 2 - Administrative Approval Steps</h3>
            </div>
            <p className="text-slate-500 text-xs mt-0.5 font-medium">Internal approval steps during the Administrative Approval stage.</p>
          </div>

          <div className="relative pl-6 border-l border-dashed border-slate-200 space-y-6">
            {level2Steps.map((stage, idx) => (
              <div key={idx} className="relative flex gap-4 items-start">
                {/* Stepper Dot */}
                <div className={`absolute -left-[37px] top-1 w-5 h-5 rounded-full border flex items-center justify-center bg-white ${getStatusClasses(stage.status)}`}>
                  {getStatusIcon(stage.status)}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap justify-between items-start gap-1">
                    <span className={`text-xs font-bold ${stage.status === 'current' ? 'text-blue-700 font-extrabold' : 'text-slate-700'}`}>
                      {stage.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${getStatusClasses(stage.status)}`}>
                        {stage.status === 'current' ? 'Pending Action' : stage.status === 'completed' ? 'Approved' : stage.status.toUpperCase()}
                      </span>
                      {stage.date && (
                        <span className="text-[10px] text-slate-400 font-semibold font-mono">
                          {stage.date}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-slate-500 text-[11px] mt-0.5 leading-relaxed font-medium">{stage.description}</p>
                  {stage.actor && stage.status !== 'pending' && (
                    <p className="text-[10px] text-slate-400 font-semibold mt-1">
                      Details/Actors: <span className="text-slate-600">{stage.actor}</span>
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* METADATA SUMMARY PANEL */}
      <div className="card bg-slate-50/50 border border-slate-200 p-5 rounded-xl text-left space-y-4 shadow-sm">
        <h4 className="text-xs font-extrabold text-slate-700 uppercase tracking-widest">Workflow Step Metadata</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Current Stage</span>
            <span className="font-bold text-[#1a3a6b] mt-1 block truncate" title={metadata.currentStage}>{metadata.currentStage}</span>
          </div>
          <div className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pending with User</span>
            <span className="font-bold text-slate-700 mt-1 block truncate" title={metadata.pendingWithUser}>{metadata.pendingWithUser}</span>
          </div>
          <div className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pending with Role</span>
            <span className="font-bold text-slate-700 mt-1 block truncate" title={metadata.pendingWithRole}>{metadata.pendingWithRole}</span>
          </div>
          <div className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Approval Date</span>
            <span className="font-mono font-bold text-emerald-700 mt-1 block flex items-center gap-1">
              <Calendar size={11} className="text-emerald-500" /> {metadata.approvalDate}
            </span>
          </div>
          <div className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm col-span-1 md:col-span-2">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Pending Since Date</span>
            <span className="font-mono font-bold text-amber-700 mt-1 block flex items-center gap-1">
              <Clock size={11} className="text-amber-500 animate-pulse" /> {metadata.pendingSinceDate}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
