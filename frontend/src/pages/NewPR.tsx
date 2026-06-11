import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { budgetApi, prApi } from '../services/api';
import toast from 'react-hot-toast';
import { usePRWizard } from '../hooks/usePRWizard';
import { PRWizardStepper } from '../components/pr-creation/PRWizardStepper';
import { StepSelectFiles } from '../components/pr-creation/steps/StepSelectFiles';
import { StepReviewSelection } from '../components/pr-creation/steps/StepReviewSelection';
import { StepItemDetails } from '../components/pr-creation/steps/StepItemDetails';
import { StepCommonDetails } from '../components/pr-creation/steps/StepCommonDetails';
import { StepReviewSubmit } from '../components/pr-creation/steps/StepReviewSubmit';
import { buildPRCreateFormData } from '../utils/prPayload';
import { AlertTriangle, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const NewPRPage: React.FC = () => {
  const { user } = useAuth();
  const isHod = user?.role?.group_key === 'hod';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const wizard = usePRWizard();

  const { data: budgetFiles = [] } = useQuery({
    queryKey: ['budgetFiles'],
    queryFn: () => budgetApi.files().then((r) => r.data),
  });

  const { data: departmentFaculty = [] } = useQuery({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then((r) => r.data),
    enabled: isHod,
  });

  const { data: procurementMethods = [] } = useQuery({
    queryKey: ['procurementMethods'],
    queryFn: () => budgetApi.procurementMethods().then((r) => r.data),
  });


  const selectedFiles = useMemo(
    () => budgetFiles.filter((f: any) => wizard.selection.selectedFileIds.includes(f.id)),
    [budgetFiles, wizard.selection.selectedFileIds]
  );

  const totalCost = useMemo(() => {
    return selectedFiles.reduce((acc: number, file: any) => {
      const item = wizard.items[file.id];
      const qty = Number(item?.quantity) || 1;
      return acc + (file.unit_cost * qty);
    }, 0);
  }, [selectedFiles, wizard.items]);

  const procurementMethod = procurementMethods.find(
    (m: any) => m.id === wizard.selection.procurementMethodId
  );

  const handleNext = () => {
    if (wizard.stepId === 'select') {
      const err = wizard.validateSelection(budgetFiles, procurementMethods);
      if (err) {
        toast.error(err);
        return;
      }
      wizard.initItemsFromSelection(wizard.selection.selectedFileIds, budgetFiles);
    }
    if (wizard.stepId === 'items' && procurementMethod) {
      const err = wizard.validateItems(procurementMethod.name, budgetFiles);
      if (err) {
        toast.error(err);
        return;
      }
    }
    if (wizard.stepId === 'common') {
      const err = wizard.validateCommon(totalCost, procurementMethod?.form_schema, procurementMethod?.name, isHod);
      if (err) {
        toast.error(err);
        // If the error is about a procurement-specific field, scroll the user to that section
        if (procurementMethod?.form_schema && err.includes('section at the top')) {
          setTimeout(() => {
            document.getElementById('procurement-specific-fields')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }
        return;
      }
    }
    wizard.goNext();
  };

  const handleSubmit = async () => {
    const err = wizard.validateSubmit() ?? wizard.validateCommon(totalCost, procurementMethod?.form_schema, procurementMethod?.name, isHod) ?? wizard.validateItems(procurementMethod?.name ?? '', budgetFiles);
    if (err) {
      toast.error(err);
      return;
    }
    if (!wizard.selection.procurementMethodId) return;

    setLoading(true);
    try {
      const formData = buildPRCreateFormData(
        wizard.selection.selectedFileIds,
        wizard.selection.procurementMethodId,
        wizard.items,
        wizard.common
      );
      const res = await prApi.createWithFiles(formData);
      toast.success(`PR created: ${res.data.icr_number ?? res.data.id}`);
      wizard.clearDraft();  // ← clear saved draft on success
      queryClient.invalidateQueries({ queryKey: ['prs'] });
      navigate('/pr');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to create PR');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-header">New Purchase Request</h1>
          <p className="page-subtitle">
            Multi-step initiation aligned with institute procurement guidelines.
          </p>
        </div>
        {/* Discard draft button — only show when past step 0 */}
        {wizard.stepIndex > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Discard this draft and start a new PR?')) {
                wizard.clearDraft();
              }
            }}
            className="flex items-center gap-1.5 text-xs text-rose-600 hover:text-rose-800 border border-rose-200 hover:border-rose-400 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-semibold transition-colors"
          >
            <Trash2 size={13} /> Discard Draft
          </button>
        )}
      </div>

      {/* File re-upload notice after session restore */}
      {wizard.filesNeedReupload && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-lg px-4 py-3 text-sm text-amber-800 shadow-sm">
          <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Draft restored — PDFs need re-uploading</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Your form progress was saved, but uploaded PDF files cannot be preserved across page refreshes. Please re-upload your PDF attachments before submitting.
            </p>
          </div>
          <button
            onClick={wizard.dismissFileWarning}
            className="text-amber-500 hover:text-amber-700 text-xs font-bold shrink-0 mt-0.5"
          >
            ✕
          </button>
        </div>
      )}

      <div className="card p-6">
        <PRWizardStepper currentIndex={wizard.stepIndex} />

        {wizard.stepId === 'select' && (
          <StepSelectFiles
            budgetFiles={budgetFiles}
            procurementMethods={procurementMethods}
            selection={wizard.selection}
            onChange={(patch) => wizard.setSelection((s) => ({ ...s, ...patch }))}
          />
        )}

        {wizard.stepId === 'review' && (
          <StepReviewSelection selectedFiles={selectedFiles} procurementMethod={procurementMethod} />
        )}

        {wizard.stepId === 'items' && procurementMethod && (
          <StepItemDetails
            files={selectedFiles}
            items={wizard.items}
            procurementName={procurementMethod.name}
            onUpdate={wizard.updateItem}
          />
        )}

        {wizard.stepId === 'common' && (
          <StepCommonDetails
            common={wizard.common}
            procurementName={procurementMethod?.name ?? ''}
            formSchema={procurementMethod?.form_schema}
            totalCost={totalCost}
            onUpdate={wizard.updateCommon}
            isHod={isHod}
            departmentFaculty={departmentFaculty}
          />
        )}

        {wizard.stepId === 'submit' && (
          <StepReviewSubmit
            files={selectedFiles}
            items={wizard.items}
            common={wizard.common}
            procurementName={procurementMethod?.name ?? ''}
            onUpdateCommon={wizard.updateCommon}
            onSubmit={handleSubmit}
            onBack={wizard.goBack}
            onCancel={() => navigate('/pr')}
            loading={loading}
          />
        )}

        {wizard.stepId !== 'submit' && (
          <div className="flex gap-3 pt-6 mt-6 border-t border-slate-200">
            {wizard.stepIndex > 0 && (
              <button type="button" className="btn-secondary" onClick={wizard.goBack}>
                Back
              </button>
            )}
            <button type="button" className="btn-primary ml-auto" onClick={handleNext}>
              Continue
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/pr')}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
