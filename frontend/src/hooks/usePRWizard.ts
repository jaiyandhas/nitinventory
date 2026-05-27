import { useCallback, useMemo, useState } from 'react';
import type { BudgetFile, ProcurementMethod } from '../types';
import {
  PR_CREATION_STEPS,
  type PRWizardStepId,
  isGemProcurement,
} from '../config/prCreationQuestions';
import {
  createEmptyCommonState,
  createEmptyItemState,
  type PRCommonFormState,
  type PRItemFormState,
  type PRWizardSelection,
} from '../types/prCreation';

function fieldVisible(
  showWhen: { field: string; equals: string | boolean } | undefined,
  ctx: Record<string, string | boolean | undefined>
): boolean {
  if (!showWhen) return true;
  return ctx[showWhen.field] === showWhen.equals;
}

export function usePRWizard() {
  const [stepIndex, setStepIndex] = useState(0);
  const [selection, setSelection] = useState<PRWizardSelection>({
    fileCount: 1,
    selectedFileIds: [],
    procurementMethodId: null,
  });
  const [items, setItems] = useState<Record<number, PRItemFormState>>({});
  const [common, setCommon] = useState<PRCommonFormState>(createEmptyCommonState());

  const currentStep = PR_CREATION_STEPS[stepIndex];
  const stepId = currentStep.id as PRWizardStepId;

  const initItemsFromSelection = useCallback((fileIds: number[], budgetFiles?: BudgetFile[]) => {
    setItems((prev) => {
      const next: Record<number, PRItemFormState> = {};
      for (const id of fileIds) {
        let defaultQty = '1';
        if (budgetFiles) {
          const file = budgetFiles.find((f) => f.id === id);
          if (file && file.unit_cost > 0) {
            const maxQty = Math.floor(file.available_amount / file.unit_cost);
            if (maxQty <= 0) {
              defaultQty = '0';
            }
          }
        }
        next[id] = prev[id] ?? {
          ...createEmptyItemState(id),
          quantity: defaultQty,
        };
      }
      return next;
    });
  }, []);

  const updateItem = useCallback((fileId: number, patch: Partial<PRItemFormState>) => {
    setItems((prev) => ({
      ...prev,
      [fileId]: { ...(prev[fileId] ?? createEmptyItemState(fileId)), ...patch },
    }));
  }, []);

  const updateCommon = useCallback((patch: Partial<PRCommonFormState>) => {
    setCommon((prev) => ({ ...prev, ...patch }));
  }, []);

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, PR_CREATION_STEPS.length - 1));
  }, []);

  const goBack = useCallback(() => {
    setStepIndex((i) => Math.max(i - 1, 0));
  }, []);

  const goToStep = useCallback((id: PRWizardStepId) => {
    const idx = PR_CREATION_STEPS.findIndex((s) => s.id === id);
    if (idx >= 0) setStepIndex(idx);
  }, []);

  const validateSelection = useCallback(
    (budgetFiles: BudgetFile[], procurementMethods: ProcurementMethod[]): string | null => {
      const { selectedFileIds, procurementMethodId } = selection;
      if (selectedFileIds.length === 0) return 'Select at least one budget file';
      if (new Set(selectedFileIds).size !== selectedFileIds.length) return 'Each file can only be selected once';
      const validIds = new Set(budgetFiles.map((f) => f.id));
      if (selectedFileIds.some((id) => !validIds.has(id))) return 'Invalid budget file selection';
      if (!procurementMethodId) return 'Select a mode of procurement';
      if (!procurementMethods.some((m) => m.id === procurementMethodId)) return 'Invalid procurement method';
      return null;
    },
    [selection]
  );

  const validateItems = useCallback(
    (procurementName: string, budgetFiles: BudgetFile[]): string | null => {
      const isGem = isGemProcurement(procurementName);
      for (const fileId of selection.selectedFileIds) {
        const item = items[fileId];
        if (!item) return `Missing details for file #${fileId}`;
        const ctx: Record<string, any> = {
          ...item,
          _procurement_is_gem: isGem,
        };
        const file = budgetFiles.find((f) => f.id === fileId);
        if (file && file.unit_cost > 0) {
          const maxQty = Math.floor(file.available_amount / file.unit_cost);
          if (maxQty <= 0) {
            return `Budget for "${file.item_name}" is exhausted. Please select a different budget file.`;
          }
          const qty = Number(item.quantity);
          if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
            return `Quantity for "${file.item_name}" must be a valid positive integer`;
          }
          if (qty > maxQty) {
            return `Requested quantity for "${file.item_name}" (${qty}) exceeds the maximum available quantity (${maxQty}) based on available budget`;
          }
        } else {
          const qty = Number(item.quantity);
          if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) {
            return `Quantity for all items must be a valid positive integer`;
          }
        }
        if (!item.charges.trim()) return `Enter GST & charges for all items`;
        if (!item.requirement_type) return `Select nature of requirement for all items`;
        if (!item.warranty.trim()) return `Enter warranty for all items`;
        if (!item.delivery_period.trim()) return `Enter delivery period for all items`;
        if (!item.installation_required) return `Select installation required for all items`;
        if (!item.site_readiness) return `Select site readiness for all items`;
        if (fieldVisible({ field: 'site_readiness', equals: 'No' }, ctx) && !item.site_readiness_remarks.trim()) {
          return `Provide site readiness remarks where site is not ready`;
        }
        if (isGem && !item.gem_link.trim()) return `GeM product link required for GeM procurement`;
        if (!isGem && !item.gem_nac_file) return `GeM NAC certificate required for non-GeM procurement`;
        if (!item.availability) return `Select department availability for all items`;
        if (fieldVisible({ field: 'availability', equals: 'Yes' }, ctx)) {
          if (!item.present_stock.trim() || !item.justification_for_procurement.trim() || !item.previous_file_no_reference.trim()) {
            return `Complete department availability details for all applicable items`;
          }
        }
        if (!item.tech_specs_text.trim()) return `Enter technical specifications for all items`;
        if (!item.tech_specs_file) return `Upload tech spec PDF for all items`;
      }
      return null;
    },
    [items, selection.selectedFileIds]
  );

  const validateCommon = useCallback((): string | null => {
    if (!common.purchase_type) return 'Select a purchase type';
    if (!common.basis_of_estimate.trim()) return 'Describe how the basis of estimate was made';
    if (!common.quotation_file) return 'Upload basis of estimation PDF';
    if (!common.emd) return 'Select EMD percentage';
    if (!common.performance_security) return 'Select performance security percentage';
    if (!common.is_service_center_south) return 'Answer service center location question';
    if (common.is_service_center_south === 'Yes') {
      if (!common.service_center_location.trim()) return 'Enter service centre location';
      if (!common.service_center_south_desc.trim()) return 'Enter justification for using a southern-region service centre';
    }
    if (!common.delivery_location.trim()) return 'Enter delivery location';
    if (!common.delivery_mode.trim()) return 'Enter delivery mode';
    if (!common.is_quantity_split) return 'Answer quantity splitting question';
    if (common.is_quantity_split === 'No' && !common.split_quantity_justification.trim()) {
      return 'Provide justification for non-splitting of quantity';
    }
    if (!common.is_item_split) return 'Answer item splitting question';
    if (common.is_item_split === 'No' && !common.split_items_justification.trim()) {
      return 'Provide justification for non-splitting of items';
    }
    if (!common.exemption) return 'Answer MSE/Startup exception question';
    if (common.exemption === 'Yes' && !common.exemption_remarks.trim()) {
      return 'Provide justification for seeking an MSE/startup exception';
    }
    if (common.exemption === 'No') {
      if (!common.msme_no_exception_route) return 'Select how standard participation norms will apply';
      if (common.msme_no_exception_route === 'other' && !common.exemption_remarks.trim()) {
        return 'Describe the “other” compliance route';
      }
    }
    if (!common.training_required) return 'Answer training requirement question';
    if (common.training_required === 'Yes') {
      if (!common.training_type || !common.training_vendor) return 'Complete training follow-up questions';
    }
    return null;
  }, [common]);

  const validateSubmit = useCallback((): string | null => {
    if (!common.termsAccepted.every(Boolean)) return 'Accept all terms and conditions';
    return null;
  }, [common.termsAccepted]);

  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / PR_CREATION_STEPS.length) * 100),
    [stepIndex]
  );

  return {
    stepIndex,
    stepId,
    steps: PR_CREATION_STEPS,
    currentStep,
    progress,
    selection,
    setSelection,
    items,
    common,
    updateItem,
    updateCommon,
    initItemsFromSelection,
    goNext,
    goBack,
    goToStep,
    validateSelection,
    validateItems,
    validateCommon,
    validateSubmit,
  };
}
