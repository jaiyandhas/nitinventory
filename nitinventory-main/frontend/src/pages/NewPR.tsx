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

export const NewPRPage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const wizard = usePRWizard();

  const { data: budgetFiles = [] } = useQuery({
    queryKey: ['budgetFiles'],
    queryFn: () => budgetApi.files().then((r) => r.data),
  });

  const { data: procurementMethods = [] } = useQuery({
    queryKey: ['procurementMethods'],
    queryFn: () => budgetApi.procurementMethods().then((r) => r.data),
  });

  const { data: facultyOptions = [] } = useQuery({
    queryKey: ['departmentFaculty'],
    queryFn: () => budgetApi.departmentFaculty().then((r) => r.data),
  });

  const selectedFiles = useMemo(
    () => budgetFiles.filter((f: any) => wizard.selection.selectedFileIds.includes(f.id)),
    [budgetFiles, wizard.selection.selectedFileIds]
  );

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
      wizard.initItemsFromSelection(wizard.selection.selectedFileIds);
    }
    if (wizard.stepId === 'items' && procurementMethod) {
      const err = wizard.validateItems(procurementMethod.name);
      if (err) {
        toast.error(err);
        return;
      }
    }
    if (wizard.stepId === 'common') {
      const err = wizard.validateCommon();
      if (err) {
        toast.error(err);
        return;
      }
    }
    wizard.goNext();
  };

  const handleSubmit = async () => {
    const err = wizard.validateSubmit() ?? wizard.validateCommon() ?? wizard.validateItems(procurementMethod?.name ?? '');
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
      <div>
        <h1 className="page-header">New Purchase Request</h1>
        <p className="page-subtitle">
          Multi-step initiation aligned with institute procurement requirements (mapped from NPFS).
        </p>
      </div>

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
            facultyOptions={facultyOptions}
            procurementName={procurementMethod?.name ?? ''}
            onUpdate={wizard.updateCommon}
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
            loading={loading}
            onBack={wizard.goBack}
            onCancel={() => navigate('/pr')}
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
