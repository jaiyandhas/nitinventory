import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { budgetApi, prApi } from '../services/api';
import { queryKeys } from '../config/queryKeys';
import toast from 'react-hot-toast';
import { usePRWizard } from '../hooks/usePRWizard';
import { PRWizardStepper } from '../components/pr-creation/PRWizardStepper';
import { StepSelectFiles } from '../components/pr-creation/steps/StepSelectFiles';
import { StepReviewSelection } from '../components/pr-creation/steps/StepReviewSelection';
import { StepItemDetails } from '../components/pr-creation/steps/StepItemDetails';
import { StepCommonDetails } from '../components/pr-creation/steps/StepCommonDetails';
import { StepReviewSubmit } from '../components/pr-creation/steps/StepReviewSubmit';
import { buildPRCreateFormData } from '../utils/prPayload';
import { AlertTriangle, RotateCcw, Trash2, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const NewPRPage: React.FC = () => {
  const { user } = useAuth();
  const isHod = user?.role?.group_key === 'hod';
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const wizard = usePRWizard();

  const { data: budgetFiles = [], isLoading: loadingBudgets } = useQuery({
    queryKey: queryKeys.budgets.files(),
    queryFn: () => budgetApi.files().then((r) => r.data),
    refetchOnMount: 'always',
  });

  const { data: departmentFaculty = [] } = useQuery({
    queryKey: queryKeys.users.deptFaculty,
    queryFn: () => budgetApi.departmentFaculty().then((r) => r.data),
    enabled: isHod,
  });

  const { data: procurementMethods = [], isLoading: loadingMethods } = useQuery({
    queryKey: queryKeys.budgets.procurementMethods,
    queryFn: () => budgetApi.procurementMethods().then((r) => r.data),
  });

  const isDataLoading = loadingBudgets || loadingMethods;

  const selectedFiles = useMemo(
    () => budgetFiles.filter((f: any) => wizard.selection.selectedFileIds.includes(f.id)),
    [budgetFiles, wizard.selection.selectedFileIds]
  );

  // Filter out any stale/invalid selected file IDs or procurement methods that are no longer available in the active lists (e.g. from draft restoration)
  React.useEffect(() => {
    if (!loadingBudgets && !loadingMethods) {
      const validFileIds = new Set(budgetFiles.map((f: any) => f.id));
      const filteredFileIds = wizard.selection.selectedFileIds.filter((id) => validFileIds.has(id));
      
      const validProcMethodIds = new Set(procurementMethods.map((m: any) => m.id));
      const isProcMethodValid = wizard.selection.procurementMethodId === null || validProcMethodIds.has(wizard.selection.procurementMethodId);
      
      const fileIdsChanged = filteredFileIds.length !== wizard.selection.selectedFileIds.length;
      const procMethodChanged = !isProcMethodValid;
      
      if (fileIdsChanged || procMethodChanged) {
        wizard.setSelection((prev) => ({
          ...prev,
          selectedFileIds: filteredFileIds,
          fileCount: Math.max(1, filteredFileIds.length),
          procurementMethodId: isProcMethodValid ? prev.procurementMethodId : null,
        }));
      }
    }
  }, [loadingBudgets, loadingMethods, budgetFiles, procurementMethods, wizard.selection.selectedFileIds, wizard.selection.procurementMethodId, wizard.setSelection]);

  // Auto-sync source of fund from selected budget files (including draft restore & async loading)
  React.useEffect(() => {
    if (budgetFiles.length > 0 && wizard.selection.selectedFileIds.length > 0) {
      const file = budgetFiles.find((f: any) => f.id === wizard.selection.selectedFileIds[0]);
      if (file) {
        const rawSource = file.source_of_fund || '';
        let sourceVal: 'OH-35' | 'OH-31' | 'SW' | 'SEED' | 'Project code' | 'Others' | '' = '';
        let projectCode = '';
        let others = '';

        if (rawSource.toUpperCase().includes('OH-35')) {
          sourceVal = 'OH-35';
        } else if (rawSource.toUpperCase().includes('OH-31')) {
          sourceVal = 'OH-31';
        } else if (rawSource.toUpperCase().includes('SW') || rawSource.toUpperCase().includes('STUDENT-WELFARE')) {
          sourceVal = 'SW';
        } else if (rawSource.toUpperCase().includes('SEED')) {
          sourceVal = 'SEED';
        } else if (rawSource.toUpperCase() === 'R&C') {
          sourceVal = 'Project code';
          projectCode = file.project_code || '';
        } else {
          sourceVal = 'Others';
          others = rawSource;
        }

        if (
          wizard.common.source_of_fund !== sourceVal ||
          wizard.common.source_of_fund_project_code !== projectCode ||
          wizard.common.source_of_fund_others !== others
        ) {
          wizard.updateCommon({
            source_of_fund: sourceVal,
            source_of_fund_project_code: projectCode,
            source_of_fund_others: others,
          });
        }
      }
    }
  }, [budgetFiles, wizard.selection.selectedFileIds, wizard.common.source_of_fund, wizard.common.source_of_fund_project_code, wizard.common.source_of_fund_others]);

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
      toast.success(`Purchase Indent initiated: ${res.data.icr_number ?? res.data.id}`);
      wizard.clearDraft();  // ← clear saved draft on success
      queryClient.invalidateQueries({ queryKey: queryKeys.prs.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.files() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.overview() });
      queryClient.invalidateQueries({ queryKey: queryKeys.budgets.admin() });
      navigate('/pr');
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Failed to initiate purchase indent');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-header">Initiate Purchase Indent</h1>
          <p className="page-subtitle">
            Multi-step initiation aligned with institute procurement guidelines.
          </p>
        </div>
        {/* Discard draft button — only show when past step 0 */}
        {wizard.stepIndex > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Discard this draft and start a new purchase indent?')) {
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
            <button
              type="button"
              className="btn-primary ml-auto flex items-center gap-1.5"
              onClick={handleNext}
              disabled={isDataLoading}
            >
              {isDataLoading && <Loader2 size={14} className="animate-spin" />}
              {isDataLoading ? 'Loading data...' : 'Continue'}
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
