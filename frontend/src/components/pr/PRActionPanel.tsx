import React, { useState, useEffect } from 'react';
import { RotateCcw, XCircle, CheckCircle2, GitMerge, Info } from 'lucide-react';
import { prApi, budgetApi } from '../../services/api';
import { PurchaseRequest } from '../../types';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../config/queryKeys';

// Subcomponents
import { AAAction } from './actions/AAAction';
import { TenderingAction } from './actions/TenderingAction';
import { TechEvalAction } from './actions/TechEvalAction';
import { FinancialSanctionAction } from './actions/FinancialSanctionAction';
import { POAction } from './actions/POAction';
import { GRNAction } from './actions/GRNAction';
import { DirectorApprovalAction } from './actions/DirectorApprovalAction';
import { ReferralPanel } from './actions/ReferralPanel';
import { ClarificationPanel } from './actions/ClarificationPanel';
import { CancelPOModal } from './actions/CancelPOModal';
import { resolveTechCommitteeIds } from '../../utils/techCommittee';

interface PRActionPanelProps {
  pr: PurchaseRequest;
  user: any;
  refetch: () => void;
  faculties: any[];
}

export const PRActionPanel: React.FC<PRActionPanelProps> = ({ pr, user, refetch, faculties }) => {
  const [remarks, setRemarks] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const isHOD = user?.role?.group_key === 'hod';
  const isDirector = user && (user.role?.value === 'director' || user.role?.group_key === 'apex_approver' || user.role?.group_key === 'admin');

  // Calculate if the current user can act on the expected step
  let canActOn = false;
  if (user?.role?.group_key === 'admin') {
    canActOn = true;
  } else if (pr?.flow) {
    if (pr.flow.step_type === 'tech_evaluation') {
      const committeeIds = resolveTechCommitteeIds(pr);
      const isCommitteeMember = committeeIds.includes(user?.id ?? -1);
      const teSince = pr.te_initiated_at ? new Date(pr.te_initiated_at) : null;
      const allCommitteeSigned = committeeIds.length > 0 && committeeIds.every((id: number) =>
        pr.history?.some((h: any) =>
          h.approver_id === id &&
          (h.status === 'Technical Evaluation Completed' || h.status === 'Technical Evaluation Approved') &&
          (!teSince || !h.acted_at || new Date(h.acted_at) >= teSince)
        )
      );
      canActOn = isCommitteeMember || (allCommitteeSigned && user?.id === pr.initiator?.id);
    } else if (pr.flow.expected_user_id) {
      if (user?.id === pr.flow.expected_user_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_role_name === 'Faculty' || pr.flow.expected_group === 'faculty') {
      canActOn = user?.id === pr.initiator?.id;
    } else if (pr.flow.expected_role_id) {
      if (user?.role_id === pr.flow.expected_role_id) {
        canActOn = true;
      }
    } else if (pr.flow.expected_group) {
      if (user?.role?.group_key === pr.flow.expected_group) {
        canActOn = true;
      }
    }
  }

  const [expert1Id, setExpert1Id] = useState<number | ''>('');
  const [expert2Id, setExpert2Id] = useState<number | ''>('');
  const [directorFacultyId, setDirectorFacultyId] = useState<number | ''>('');

  useEffect(() => {
    if (pr) {
      setExpert1Id(pr.faculty1_id || '');
      setExpert2Id(pr.faculty2_id || '');
      setDirectorFacultyId(pr.faculty3_id || '');
    }
  }, [pr]);

  const { data: allUsers = [] } = useQuery<any[]>({
    queryKey: queryKeys.users.directorNomination,
    queryFn: () => budgetApi.allUsers().then(r => r.data),
    enabled: !!isDirector && pr.flow?.phase_name === 'Indent and Detailed Tech Specification',
  });

  // Send back states
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const hasPrevStep = !!(pr.flow && pr.flow.step_order > 1);

  // Cancellation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<'tender' | 'po' | null>(null);

  const isAuthorizedToCancel = user?.id === pr.initiator_id || user?.id === pr.hod_id || user?.role?.group_key === 'admin';

  const handleAdvance = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to advance the Purchase Indent'); return; }

    if (pr.flow?.phase_name === 'Indent and Detailed Tech Specification') {
      // Expert 1 is mandatory; Expert 2 and Director Nominee are optional
      const nominationDone = !!pr.faculty1_id;
      if (isHOD && !nominationDone) {
        if (!expert1Id) {
          toast.error('At least Department Expert 1 must be nominated');
          return;
        }
        if (expert1Id && expert2Id && expert1Id === expert2Id) {
          toast.error('Expert 1 and Expert 2 must be different faculty members');
          return;
        }
      }
      // Director Nominee is optional — Director can approve without selecting one
    }

    if (!window.confirm('Are you sure you want to approve and advance this purchase indent?')) return;
    setActionLoading(true);
    try {
      await prApi.advance(
        pr.id,
        remarks,
        undefined,
        isHOD ? Number(expert1Id) : undefined,
        isHOD ? Number(expert2Id) : undefined,
        isDirector ? Number(directorFacultyId) : undefined
      );
      toast.success('Purchase Indent advanced successfully');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (rejectRemarks?: string) => {
    const finalRemarks = rejectRemarks || remarks;
    if (!finalRemarks.trim()) { toast.error('Rejection remarks are required'); return; }
    setActionLoading(true);
    try {
      await prApi.reject(pr.id, finalRemarks);
      toast.success('Purchase Indent returned to previous phase');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendBack = async (sendBackRemarks?: string) => {
    const finalRemarks = sendBackRemarks || remarks;
    if (!finalRemarks.trim()) { toast.error('Send back remarks are required'); return; }
    setActionLoading(true);
    try {
      await prApi.sendBack(pr.id, finalRemarks);
      toast.success('Purchase Indent sent back to previous step');
      setShowSendBackModal(false);
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReinitiate = async () => {
    if (!window.confirm('Are you sure you want to re-initiate this purchase indent? This will clone all items and start a new approval process.')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await prApi.reinitiatePr(pr.id);
      toast.success('Purchase indent re-initiated successfully!');
      window.location.href = `/pr/${res.data.id}`;
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to re-initiate request');
    } finally {
      setActionLoading(false);
    }
  };

  if (pr.current_status === 'rejected') {
    const rejectionEntry = [...(pr.history ?? [])]
      .reverse()
      .find(h => h.status?.toLowerCase().includes('rejected'));
    const isInitiator = user?.id === pr.initiator_id;

    return (
      <div className="card p-6 bg-red-50 border-red-200 space-y-4 text-left">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide border-b border-red-100 pb-2 flex items-center gap-2">
          <XCircle size={18} /> Purchase Indent Returned
        </h3>
        <p className="text-xs text-red-700 font-semibold">
          This Purchase Indent was returned by the approving authority. The budget allocation has been refunded.
        </p>
        {rejectionEntry && (
          <div className="bg-white border border-red-200 rounded-lg p-3 space-y-1">
            <p className="text-[10px] font-bold text-red-500 uppercase tracking-wider">Returned By</p>
            <p className="text-xs font-bold text-slate-800">{rejectionEntry.frozen_actor_name}</p>
            {rejectionEntry.frozen_designation && (
              <p className="text-[10px] text-slate-500">{rejectionEntry.frozen_designation}</p>
            )}
            {rejectionEntry.remarks && (
              <p className="text-xs text-red-800 italic mt-1">"{rejectionEntry.remarks}"</p>
            )}
          </div>
        )}
        <p className="text-xs text-slate-600">
          You may re-initiate this procurement with revised details. A new Purchase Indent will be created with all items carried over.
        </p>
        {isInitiator && (
          <div className="pt-2">
            <button
              onClick={handleReinitiate}
              disabled={actionLoading}
              className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-none text-white"
            >
              <RotateCcw size={16} /> Re-initiate Purchase Indent
            </button>
          </div>
        )}
      </div>
    );
  }

  if (pr.current_status === 'cancelled') {
    return (
      <div className="card p-6 bg-red-50 border-red-200 space-y-4 text-left">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide border-b border-red-100 pb-2 flex items-center gap-2">
          <XCircle size={18} /> Purchase Indent Cancelled
        </h3>
        <p className="text-xs text-red-700 font-semibold">
          This purchase indent has been cancelled and its budget allocation has been refunded.
        </p>
        {isAuthorizedToCancel && (
          <div className="pt-2">
            <button
              onClick={handleReinitiate}
              disabled={actionLoading}
              className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-none text-white"
            >
              <RotateCcw size={16} /> Re-initiate Purchase Indent
            </button>
          </div>
        )}
      </div>
    );
  }

  if (pr.current_status === 'po_issued' || pr.current_status === 'completed') {
    const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
    return (
      <div className="space-y-6 animate-fadeIn">
        {pr.current_status === 'po_issued' && (
          <div className="card p-6 bg-green-50 border-green-200 space-y-4 text-left">
            <h3 className="text-sm font-bold text-green-800 uppercase tracking-wide border-b border-green-100 pb-2 flex items-center gap-2">
              <CheckCircle2 size={18} /> Purchase Order Issued
            </h3>
            <p className="text-xs text-green-700 font-semibold">
              The purchase order has been successfully issued. Funds have been deducted from the department budget.
            </p>
            {isAuthorizedToCancel && !verifiedDelivery && (
              <div className="pt-2">
                <button
                  onClick={() => {
                    setCancelType('po');
                    setShowCancelModal(true);
                  }}
                  disabled={actionLoading}
                  className="btn-danger py-2 px-6 font-semibold shadow-md flex items-center gap-2"
                >
                  <XCircle size={16} /> Cancel Purchase Order (PO)
                </button>
              </div>
            )}
          </div>
        )}
        <GRNAction
          pr={pr}
          user={user}
          refetch={refetch}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
        />
        {showCancelModal && (
          <CancelPOModal
            prId={pr.id}
            cancelType={cancelType}
            onClose={() => {
              setShowCancelModal(false);
              setCancelType(null);
            }}
            refetch={refetch}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
          />
        )}
      </div>
    );
  }

  const phaseName = pr.flow?.phase_name;
  const isPartialApprover = pr.flow?.step_type === 'partial_approver';

  // For partial_approver: count qualified vendors to show the Dean what will happen
  const qualifiedVendorCount = (pr.commercial_evaluations ?? []).filter((ce: any) => ce.is_qualified).length;

  const renderStageAction = () => {
    switch (phaseName) {
      case 'Indent and Detailed Tech Specification': {
        // When the current step is the committee tech-evaluation sub-step, show appropriate UI
        if (pr.flow?.step_type === 'tech_evaluation') {
          const committeeIds = resolveTechCommitteeIds(pr);
          const alreadySigned = (pr.history ?? []).some(
            (h: any) =>
              (h.status === 'Technical Evaluation Approved' || h.status === 'Technical Evaluation Completed') &&
              h.approver_id === user?.id
          );
          const signedIds = new Set(
            (pr.history ?? [])
              .filter((h: any) =>
                h.status === 'Technical Evaluation Approved' || h.status === 'Technical Evaluation Completed'
              )
              .map((h: any) => h.approver_id)
          );
          const pendingCount = committeeIds.filter(id => !signedIds.has(id)).length;

          if (alreadySigned) {
            return (
              <div className="pt-2 border-t border-blue-200 text-left">
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-3">
                  <CheckCircle2 size={18} className="text-indigo-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-indigo-800">You have approved the Technical Specification.</p>
                    <p className="text-xs text-indigo-600 mt-1">
                      {pendingCount === 0
                        ? 'All committee members have approved.'
                        : `Awaiting ${pendingCount} more committee member${pendingCount > 1 ? 's' : ''} to approve.`}
                    </p>
                  </div>
                </div>
              </div>
            );
          }

          // Committee member has not yet signed — show Approve / Send Back form
          return (
            <div className="space-y-4 bg-white p-4 border border-blue-200 rounded text-left animate-fadeIn">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Technical Committee — Technical Specification Approval
              </h4>
              <p className="text-xs text-slate-500">
                Review the technical specification in the indent document and approve or send back.
                {pendingCount > 0 && ` (${pendingCount} member${pendingCount > 1 ? 's' : ''} still pending)`}
              </p>
              <div className="space-y-2">
                <label className="label text-slate-700 font-bold text-xs">Remarks *</label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Provide your technical review remarks..."
                  className="input-field min-h-[70px] text-xs py-1.5 bg-white text-sm"
                  required
                />
              </div>
              <div className="flex flex-wrap gap-2.5 pt-1">
                <button
                  onClick={() => handleAdvance()}
                  disabled={actionLoading || !remarks.trim()}
                  className="btn-primary py-2 px-4 flex items-center gap-1.5 shadow-md font-semibold text-xs"
                >
                  <CheckCircle2 size={14} /> Approve Technical Specification
                </button>
                <button
                  onClick={() => handleReject()}
                  disabled={actionLoading || !remarks.trim()}
                  className="btn-danger flex items-center gap-1.5 text-xs py-2 px-4"
                >
                  <XCircle size={14} /> Reject
                </button>
                {hasPrevStep && (
                  <button
                    type="button"
                    onClick={() => setShowSendBackModal(true)}
                    disabled={actionLoading}
                    className="btn-secondary border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 flex items-center gap-1.5 rounded px-4 py-2 text-xs font-medium transition"
                  >
                    <RotateCcw size={14} /> Send Back
                  </button>
                )}
              </div>
            </div>
          );
        }

        return (
          <AAAction
            pr={pr}
            actionLoading={actionLoading}
            hasPrevStep={hasPrevStep}
            onAdvance={handleAdvance}
            onReject={() => handleReject()}
            onSendBackClick={() => setShowSendBackModal(true)}
            remarks={remarks}
            setRemarks={setRemarks}
            isHOD={isHOD}
            isDirector={isDirector}
            nominationDone={!!pr.faculty1_id}
            expert1Id={expert1Id}
            setExpert1Id={setExpert1Id}
            expert2Id={expert2Id}
            setExpert2Id={setExpert2Id}
            directorFacultyId={directorFacultyId}
            setDirectorFacultyId={setDirectorFacultyId}
            faculties={faculties}
            allUsers={allUsers}
          />
        );
      }
      case 'Tendering':
        return (
          <TenderingAction
            pr={pr}
            user={user}
            refetch={refetch}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            hasPrevStep={hasPrevStep}
            onReject={(r) => handleReject(r)}
            onSendBack={(r) => handleSendBack(r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            remarks={remarks}
            setRemarks={setRemarks}
          />
        );
      case 'Technical Evaluation':
        return (
          <TechEvalAction
            pr={pr}
            user={user}
            refetch={refetch}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            hasPrevStep={hasPrevStep}
            onReject={(r) => handleReject(r)}
            onSendBack={(r) => handleSendBack(r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            remarks={remarks}
            setRemarks={setRemarks}
          />
        );
      case 'Financial Sanction':
        return (
          <FinancialSanctionAction
            pr={pr}
            user={user}
            refetch={refetch}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            hasPrevStep={hasPrevStep}
            onReject={(r) => handleReject(r)}
            onSendBack={(r) => handleSendBack(r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            remarks={remarks}
            setRemarks={setRemarks}
          />
        );
      case 'Purchase Order':
        return (
          <POAction
            pr={pr}
            user={user}
            actionLoading={actionLoading}
            hasPrevStep={hasPrevStep}
            onAdvance={handleAdvance}
            onReject={() => handleReject()}
            onSendBackClick={() => setShowSendBackModal(true)}
            remarks={remarks}
            setRemarks={setRemarks}
          />
        );
      default:
        return (
          <DirectorApprovalAction
            pr={pr}
            actionLoading={actionLoading}
            hasPrevStep={hasPrevStep}
            onAdvance={handleAdvance}
            onReject={() => handleReject()}
            onSendBackClick={() => setShowSendBackModal(true)}
            remarks={remarks}
            setRemarks={setRemarks}
            isDirector={isDirector}
            directorFacultyId={directorFacultyId}
            setDirectorFacultyId={setDirectorFacultyId}
            allUsers={allUsers}
          />
        );
    }
  };

  return (
    <div className="card p-6 bg-blue-50 border-blue-100 space-y-6">
      <h3 className="text-sm font-bold text-[#1a3a6b] uppercase tracking-wide border-b border-blue-100 pb-2 flex items-center gap-2">
        {isPartialApprover && <GitMerge size={16} className="text-amber-600" />}
        Action Stage: {phaseName || pr.current_status.toUpperCase()}
        {isPartialApprover && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">Partial Approver</span>}
      </h3>

      {/* Partial-approver informational banner */}
      {isPartialApprover && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex gap-3 text-left">
          <Info size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-800">Conditional Review Required</p>
            <p className="text-xs text-amber-700">
              You are acting as <strong>Partial Approver</strong> for this stage.
              The next step (Director approval) is only required when fewer than{' '}
              <strong>{pr.flow?.condition_value ?? 3}</strong> vendors qualify.
            </p>
            <p className="text-xs font-medium mt-1 ">
              {qualifiedVendorCount >= (pr.flow?.condition_value ?? 3) ? (
                <span className="text-green-700">
                  ✓ {qualifiedVendorCount} qualified vendors — Director approval will be <strong>skipped</strong> after your approval.
                </span>
              ) : (
                <span className="text-red-700">
                  ⚠ Only {qualifiedVendorCount} qualified vendor{qualifiedVendorCount !== 1 ? 's' : ''} — Director approval will be <strong>required</strong> after your approval.
                </span>
              )}
            </p>
          </div>
        </div>
      )}

      {canActOn && renderStageAction()}

      <ReferralPanel
        pr={pr}
        user={user}
        refetch={refetch}
        actionLoading={actionLoading}
        setActionLoading={setActionLoading}
      />

      {/* Technical Clarification panel — Tendering phase only */}
      {phaseName === 'Tendering' && (
        <ClarificationPanel
          pr={pr}
          user={user}
          refetch={refetch}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
        />
      )}

      {showSendBackModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn text-left">
          <div className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              Send Back to Previous Step
            </h3>
            <p className="text-xs text-slate-500">
              This will return the indent to the immediately preceding approver in the current phase.
            </p>

            <div>
              <label className="label text-slate-600">Remarks / Reason *</label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Specify corrections required..."
                className="input-field mt-1 resize-none w-full bg-white text-sm"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSendBackModal(false)}
                className="px-4 py-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSendBack()}
                disabled={actionLoading || !remarks.trim()}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded flex items-center gap-1.5"
              >
                Confirm Send Back
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <CancelPOModal
          prId={pr.id}
          cancelType={cancelType}
          onClose={() => {
            setShowCancelModal(false);
            setCancelType(null);
          }}
          refetch={refetch}
          actionLoading={actionLoading}
          setActionLoading={setActionLoading}
        />
      )}
    </div>
  );
};
