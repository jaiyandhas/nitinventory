import React, { useState, useEffect } from 'react';
import { RotateCcw, XCircle, CheckCircle2, GitMerge, Info } from 'lucide-react';
import { prApi, budgetApi } from '../../services/api';
import { PurchaseRequest } from '../../types';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';

// Subcomponents
import { AAAction } from './actions/AAAction';
import { TenderingAction } from './actions/TenderingAction';
import { TechEvalAction } from './actions/TechEvalAction';
import { FinancialSanctionAction } from './actions/FinancialSanctionAction';
import { POAction } from './actions/POAction';
import { GRNAction } from './actions/GRNAction';
import { DirectorApprovalAction } from './actions/DirectorApprovalAction';
import { ReferralPanel } from './actions/ReferralPanel';
import { CancelPOModal } from './actions/CancelPOModal';

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
    queryKey: ['all_users_for_director_nomination'],
    queryFn: () => budgetApi.allUsers().then(r => r.data),
    enabled: !!isDirector && pr.flow?.phase_name === 'Administrative Approval',
  });

  // Send back states
  const [showSendBackModal, setShowSendBackModal] = useState(false);
  const [sendBackCandidates, setSendBackCandidates] = useState<any[]>([]);
  const [selectedSendBackStep, setSelectedSendBackStep] = useState<number | ''>('');

  // Cancellation states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelType, setCancelType] = useState<'tender' | 'po' | null>(null);

  const isAuthorizedToCancel = user?.id === pr.initiator_id || user?.id === pr.hod_id || user?.role?.group_key === 'admin';

  useEffect(() => {
    if (pr.flow && pr.flow.step_order > 1) {
      prApi.getSendBackCandidates(pr.id).then(res => {
        setSendBackCandidates(res.data);
        if (res.data.length > 0) {
          setSelectedSendBackStep(res.data[res.data.length - 1].step_order);
        }
      }).catch(() => {});
    }
  }, [pr]);

  const handleAdvance = async () => {
    if (!remarks.trim()) { toast.error('Remarks are required to advance the PR'); return; }

    if (pr.flow?.phase_name === 'Administrative Approval') {
      if (isHOD) {
        if (!expert1Id || !expert2Id) {
          toast.error('Both Expert 1 and Expert 2 must be nominated');
          return;
        }
        if (expert1Id === expert2Id) {
          toast.error('Expert 1 and Expert 2 must be different faculty members');
          return;
        }
      } else if (isDirector) {
        if (!directorFacultyId) {
          toast.error('Director Nominee must be nominated');
          return;
        }
      }
    }

    if (!window.confirm('Are you sure you want to approve and advance this purchase request?')) return;
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
      toast.success('PR advanced successfully');
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
      toast.success('PR rejected');
      setRemarks('');
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendBack = async (sendBackStep?: number, sendBackRemarks?: string) => {
    const targetStep = sendBackStep || selectedSendBackStep;
    const finalRemarks = sendBackRemarks || remarks;
    if (!targetStep) { toast.error('Please select a workflow step to send back to'); return; }
    if (!finalRemarks.trim()) { toast.error('Send back remarks are required'); return; }
    setActionLoading(true);
    try {
      await prApi.sendBack(pr.id, Number(targetStep), finalRemarks);
      toast.success('PR sent back successfully');
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
    if (!window.confirm('Are you sure you want to re-initiate this purchase request? This will clone all items and start a new approval process.')) {
      return;
    }
    setActionLoading(true);
    try {
      const res = await prApi.reinitiatePr(pr.id);
      toast.success('Purchase request re-initiated successfully!');
      window.location.href = `/pr/${res.data.id}`;
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to re-initiate request');
    } finally {
      setActionLoading(false);
    }
  };

  if (pr.current_status === 'cancelled') {
    return (
      <div className="card p-6 bg-red-50 border-red-200 space-y-4 text-left">
        <h3 className="text-sm font-bold text-red-800 uppercase tracking-wide border-b border-red-100 pb-2 flex items-center gap-2">
          <XCircle size={18} /> Purchase Request Cancelled
        </h3>
        <p className="text-xs text-red-700 font-semibold">
          This purchase request has been cancelled and its budget allocation has been refunded.
        </p>
        {isAuthorizedToCancel && (
          <div className="pt-2">
            <button
              onClick={handleReinitiate}
              disabled={actionLoading}
              className="btn-primary py-2 px-6 font-semibold shadow-md flex items-center gap-2 bg-orange-600 hover:bg-orange-700 border-none text-white"
            >
              <RotateCcw size={16} /> Re-initiate Purchase Request
            </button>
          </div>
        )}
      </div>
    );
  }

  if (pr.current_status === 'po_issued') {
    const verifiedDelivery = pr.deliveries?.find((d: any) => d.status === 'verified');
    return (
      <div className="space-y-6 animate-fadeIn">
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
      case 'Administrative Approval':
        return (
          <AAAction
            pr={pr}
            actionLoading={actionLoading}
            sendBackCandidates={sendBackCandidates}
            onAdvance={handleAdvance}
            onReject={() => handleReject()}
            onSendBackClick={() => setShowSendBackModal(true)}
            remarks={remarks}
            setRemarks={setRemarks}
            isHOD={isHOD}
            isDirector={isDirector}
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
      case 'Tendering':
        return (
          <TenderingAction
            pr={pr}
            user={user}
            refetch={refetch}
            actionLoading={actionLoading}
            setActionLoading={setActionLoading}
            sendBackCandidates={sendBackCandidates}
            onReject={(r) => handleReject(r)}
            onSendBack={(step, r) => handleSendBack(step, r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            selectedSendBackStep={selectedSendBackStep}
            setSelectedSendBackStep={setSelectedSendBackStep}
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
            sendBackCandidates={sendBackCandidates}
            onReject={(r) => handleReject(r)}
            onSendBack={(step, r) => handleSendBack(step, r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            selectedSendBackStep={selectedSendBackStep}
            setSelectedSendBackStep={setSelectedSendBackStep}
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
            sendBackCandidates={sendBackCandidates}
            onReject={(r) => handleReject(r)}
            onSendBack={(step, r) => handleSendBack(step, r)}
            showSendBackModal={showSendBackModal}
            setShowSendBackModal={setShowSendBackModal}
            selectedSendBackStep={selectedSendBackStep}
            setSelectedSendBackStep={setSelectedSendBackStep}
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
            sendBackCandidates={sendBackCandidates}
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
            sendBackCandidates={sendBackCandidates}
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

      {renderStageAction()}

      <ReferralPanel
        pr={pr}
        user={user}
        refetch={refetch}
        actionLoading={actionLoading}
        setActionLoading={setActionLoading}
      />

      {showSendBackModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn text-left">
          <div className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-md w-full p-6 space-y-4">
            <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
              Reflect Back Purchase Request
            </h3>
            
            <div>
              <label className="label text-slate-600">Select Target Workflow Step</label>
              <select 
                value={selectedSendBackStep} 
                onChange={(e) => setSelectedSendBackStep(Number(e.target.value))}
                className="input-field mt-1 w-full bg-white"
              >
                {sendBackCandidates.map(c => (
                  <option key={c.step_order} value={c.step_order}>
                    Step {c.step_order}: {c.user_type} ({c.user_group})
                  </option>
                ))}
              </select>
            </div>

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
