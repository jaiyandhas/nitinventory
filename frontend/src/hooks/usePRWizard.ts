import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BudgetFile, ProcurementMethod } from '../types';
import {
  PR_CREATION_STEPS,
  type PRWizardStepId,
  isGemProcurement,
  yesNoToBool,
} from '../config/prCreationQuestions';
import {
  createEmptyCommonState,
  createEmptyItemState,
  type PRCommonFormState,
  type PRItemFormState,
  type PRWizardSelection,
} from '../types/prCreation';

// ─── Session-storage key ──────────────────────────────────────────────────────
const DRAFT_KEY = 'pr_wizard_draft';

// ─── Serialisable shapes (File fields replaced by name strings) ───────────────
interface SerializedItem extends Omit<PRItemFormState, 'gem_nac_file' | 'tech_specs_file'> {
  gem_nac_file_name?: string | null;
  tech_specs_file_name?: string | null;
}

interface SerializedCommon extends Omit<PRCommonFormState, 'quotation_file' | 'dept_pac_file' | 'oem_pac_file' | 'oem_auth_file'> {
  quotation_file_name?: string | null;
  dept_pac_file_name?: string | null;
  oem_pac_file_name?: string | null;
  oem_auth_file_name?: string | null;
}

interface DraftState {
  stepIndex: number;
  selection: PRWizardSelection;
  items: Record<number, SerializedItem>;
  common: SerializedCommon;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function serializeItems(items: Record<number, PRItemFormState>): Record<number, SerializedItem> {
  const out: Record<number, SerializedItem> = {};
  for (const [k, v] of Object.entries(items)) {
    const { gem_nac_file, tech_specs_file, ...rest } = v;
    out[Number(k)] = {
      ...rest,
      gem_nac_file_name: gem_nac_file?.name ?? null,
      tech_specs_file_name: tech_specs_file?.name ?? null,
    };
  }
  return out;
}

function serializeCommon(common: PRCommonFormState): SerializedCommon {
  const { quotation_file, dept_pac_file, oem_pac_file, oem_auth_file, ...rest } = common;
  return {
    ...rest,
    quotation_file_name: quotation_file?.name ?? null,
    dept_pac_file_name: dept_pac_file?.name ?? null,
    oem_pac_file_name: oem_pac_file?.name ?? null,
    oem_auth_file_name: oem_auth_file?.name ?? null,
  };
}

function deserializeCommon(s: SerializedCommon): PRCommonFormState {
  const { quotation_file_name, dept_pac_file_name, oem_pac_file_name, oem_auth_file_name, ...rest } = s;
  return {
    ...rest,
    quotation_file: null,
    dept_pac_file: null,
    oem_pac_file: null,
    oem_auth_file: null,
  };
}

function deserializeItems(s: Record<number, SerializedItem>): Record<number, PRItemFormState> {
  const out: Record<number, PRItemFormState> = {};
  for (const [k, v] of Object.entries(s)) {
    const { gem_nac_file_name, tech_specs_file_name, ...rest } = v;
    out[Number(k)] = { ...rest, gem_nac_file: null, tech_specs_file: null };
  }
  return out;
}

function loadDraft(): DraftState | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DraftState;
  } catch {
    return null;
  }
}

function saveDraft(state: DraftState) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or private mode — silently ignore
  }
}

function clearDraftStorage() {
  sessionStorage.removeItem(DRAFT_KEY);
}

// ─── Check if any File field was saved (name present but File object gone) ────
function hasMissingFiles(
  items: Record<number, PRItemFormState>,
  itemsSerialized: Record<number, SerializedItem>,
  common: PRCommonFormState,
  commonSerialized: SerializedCommon
): boolean {
  if (commonSerialized.quotation_file_name && !common.quotation_file) return true;
  if (commonSerialized.dept_pac_file_name && !common.dept_pac_file) return true;
  if (commonSerialized.oem_pac_file_name && !common.oem_pac_file) return true;
  if (commonSerialized.oem_auth_file_name && !common.oem_auth_file) return true;
  for (const [k, s] of Object.entries(itemsSerialized)) {
    const live = items[Number(k)];
    if (!live) continue;
    if (s.gem_nac_file_name && !live.gem_nac_file) return true;
    if (s.tech_specs_file_name && !live.tech_specs_file) return true;
  }
  return false;
}

// ─── fieldVisible helper ──────────────────────────────────────────────────────
function fieldVisible(
  showWhen: { field: string; equals: string | boolean } | undefined,
  ctx: Record<string, string | boolean | undefined>
): boolean {
  if (!showWhen) return true;
  return ctx[showWhen.field] === showWhen.equals;
}

// ─── Main hook ────────────────────────────────────────────────────────────────
export function usePRWizard() {
  // Load persisted draft on first render
  const draft = useMemo(() => loadDraft(), []);

  const [stepIndex, setStepIndex] = useState(draft?.stepIndex ?? 0);
  const [selection, setSelection] = useState<PRWizardSelection>(
    draft?.selection ?? { fileCount: 1, selectedFileIds: [], procurementMethodId: null, administrativeApprovalId: null }
  );
  const [items, setItems] = useState<Record<number, PRItemFormState>>(
    draft?.items ? deserializeItems(draft.items) : {}
  );
  const [common, setCommon] = useState<PRCommonFormState>(
    draft?.common ? deserializeCommon(draft.common) : createEmptyCommonState()
  );

  // Track whether any file was present at save-time so we can show a warning
  const [filesNeedReupload, setFilesNeedReupload] = useState(() => {
    if (!draft) return false;
    const liveCommon = draft.common ? deserializeCommon(draft.common) : createEmptyCommonState();
    const liveItems = draft.items ? deserializeItems(draft.items) : {};
    return hasMissingFiles(liveItems, draft.items ?? {}, liveCommon, draft.common ?? {});
  });

  // ── Persist on every meaningful state change ────────────────────────────────
  useEffect(() => {
    saveDraft({
      stepIndex,
      selection,
      items: serializeItems(items),
      common: serializeCommon(common),
    });
  }, [stepIndex, selection, items, common]);

  const currentStep = PR_CREATION_STEPS[stepIndex];
  const stepId = currentStep.id as PRWizardStepId;

  // ── Clear draft (called after successful submit or explicit discard) ─────────
  const clearDraft = useCallback(() => {
    clearDraftStorage();
    setStepIndex(0);
    setSelection({ fileCount: 1, selectedFileIds: [], procurementMethodId: null, administrativeApprovalId: null });
    setItems({});
    setCommon(createEmptyCommonState());
    setFilesNeedReupload(false);
  }, []);

  const dismissFileWarning = useCallback(() => setFilesNeedReupload(false), []);

  // ── Core state updaters ─────────────────────────────────────────────────────
  const initItemsFromSelection = useCallback((fileIds: number[], budgetFiles?: BudgetFile[], approvedAAs?: any[]) => {
    setItems((prev) => {
      const next: Record<number, PRItemFormState> = {};
      for (const id of fileIds) {
        const existing = prev[id] ?? createEmptyItemState(id);
        let defaultQty = '1';
        let defaultCharges = existing.charges || '18';
        let defaultTechSpecs = existing.tech_specs_text || '';
        let defaultJustification = existing.justification_for_procurement || '';
        let defaultEquipName = existing.equipment_name || '';
        let defaultAvailability: 'Yes' | 'No' | '' = existing.availability || '';
        let defaultPresentStock = existing.present_stock || '';
        let defaultPrevFileNo = existing.previous_file_no_reference || '';
        let replicatedGemNacPath = '';
        let replicatedGemNacUrl = '';
        let replicatedTechSpecsPath = '';
        let replicatedTechSpecsUrl = '';

        if (budgetFiles) {
          const file = budgetFiles.find((f) => f.id === id);
          if (file) {
            defaultQty = String(file.quantity || 1);
          }
        }

        if (selection.administrativeApprovalId && approvedAAs) {
          const aa = approvedAAs.find((a) => a.id === selection.administrativeApprovalId && a.budget_file_id === id);
          if (aa) {
            defaultQty = String(aa.quantity || 1);
            defaultCharges = String(aa.gst_rate ?? 18);
            defaultTechSpecs = aa.item_description || '';
            defaultEquipName = aa.item_description || '';
            defaultJustification = aa.stock_availability === 'Yes' && aa.justification_procurement && aa.justification_procurement !== '-'
              ? aa.justification_procurement
              : (aa.justification || '');
            defaultAvailability = aa.stock_availability === 'Yes' || aa.stock_availability === 'No' ? aa.stock_availability : '';
            defaultPresentStock = aa.present_stock && aa.present_stock !== '-' ? aa.present_stock : '';
            defaultPrevFileNo = aa.prev_file_no && aa.prev_file_no !== '-' ? aa.prev_file_no : '';
            
            replicatedGemNacPath = aa.gem_non_availability_path || '';
            replicatedGemNacUrl = aa.gem_non_availability_url || '';
            replicatedTechSpecsPath = aa.attachment_path || '';
            replicatedTechSpecsUrl = aa.attachment_url || '';
          }
        }

        next[id] = {
          ...existing,
          quantity: defaultQty,
          charges: defaultCharges,
          tech_specs_text: defaultTechSpecs,
          equipment_name: defaultEquipName,
          justification_for_procurement: defaultJustification,
          availability: defaultAvailability,
          present_stock: defaultPresentStock,
          previous_file_no_reference: defaultPrevFileNo,
          replicated_gem_nac_path: replicatedGemNacPath,
          replicated_gem_nac_url: replicatedGemNacUrl,
          replicated_tech_specs_path: replicatedTechSpecsPath,
          replicated_tech_specs_url: replicatedTechSpecsUrl,
        };
      }
      return next;
    });

    if (budgetFiles && fileIds.length > 0) {
      const file = budgetFiles.find((f) => f.id === fileIds[0]);
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

        let categoryVal: 'Assets' | 'Consumables' | '' = '';
        let repQuotePath = '';
        let repQuoteUrl = '';
        let repDeptPacPath = '';
        let repDeptPacUrl = '';
        let repOemPacPath = '';
        let repOemPacUrl = '';
        let repOemAuthPath = '';
        let repOemAuthUrl = '';

        if (selection.administrativeApprovalId && approvedAAs) {
          const aa = approvedAAs.find((a) => a.id === selection.administrativeApprovalId);
          if (aa) {
            categoryVal = aa.item_category === 'Assets' || aa.item_category === 'Consumables' ? aa.item_category : '';
            repQuotePath = aa.basis_of_estimation_path || '';
            repQuoteUrl = aa.basis_of_estimation_url || '';
            repDeptPacPath = aa.pac_dept_cert_path || '';
            repDeptPacUrl = aa.pac_dept_cert_url || '';
            repOemPacPath = aa.pac_vendor_cert_path || '';
            repOemPacUrl = aa.pac_vendor_cert_url || '';
            repOemAuthPath = aa.authority_approval_path || '';
            repOemAuthUrl = aa.authority_approval_url || '';
          }
        }

        setCommon((prev) => ({
          ...prev,
          source_of_fund: sourceVal,
          source_of_fund_project_code: projectCode,
          source_of_fund_others: others,
          item_category: categoryVal || prev.item_category,
          replicated_quotation_path: repQuotePath,
          replicated_quotation_url: repQuoteUrl,
          replicated_dept_pac_path: repDeptPacPath,
          replicated_dept_pac_url: repDeptPacUrl,
          replicated_oem_pac_path: repOemPacPath,
          replicated_oem_pac_url: repOemPacUrl,
          replicated_oem_auth_path: repOemAuthPath,
          replicated_oem_auth_url: repOemAuthUrl,
        }));
      }
    }
  }, [selection.administrativeApprovalId]);

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

  // ── Validators ──────────────────────────────────────────────────────────────
  const validateSelection = useCallback(
    (budgetFiles: BudgetFile[], procurementMethods: ProcurementMethod[]): string | null => {
      const { selectedFileIds, procurementMethodId, fileCount, administrativeApprovalId } = selection;
      if (!administrativeApprovalId) return 'Please select an approved Administrative Approval reference';
      if (selectedFileIds.length === 0) return 'Select at least one budget file';
      if (selectedFileIds.length < fileCount) return 'Please select all budget files';
      if (new Set(selectedFileIds).size !== selectedFileIds.length) return 'Each file can only be selected once';
      const validIds = new Set(budgetFiles.map((f) => f.id));
      if (selectedFileIds.some((id) => !validIds.has(id))) return 'Invalid budget file selection';

      // Check if all selected budget files have the same source of fund
      const selectedFiles = selectedFileIds.map(id => budgetFiles.find(f => f.id === id)).filter((f): f is BudgetFile => !!f);
      if (selectedFiles.length > 1) {
        const firstSource = selectedFiles[0].source_of_fund;
        const mismatch = selectedFiles.find(f => f.source_of_fund !== firstSource);
        if (mismatch) {
          return `All selected budget files must have the same source of fund (e.g. ${firstSource}). Mixing different sources (like ${firstSource} and ${mismatch.source_of_fund}) is not allowed.`;
        }
      }

      if (!procurementMethodId) return 'Select a mode of procurement';
      if (!procurementMethods.some((m) => m.id === procurementMethodId)) return 'Invalid procurement method';
      return null;
    },
    [selection]
  );

  const validateItems = useCallback(
    (procurementName: string, budgetFiles: BudgetFile[], approvedAAs: any[] = []): string | null => {
      const isGem = isGemProcurement(procurementName);
      for (const fileId of selection.selectedFileIds) {
        const item = items[fileId];
        if (!item) return `Missing details for file #${fileId}`;
        const ctx: Record<string, any> = { ...item, _procurement_is_gem: isGem };
        const file = budgetFiles.find((f) => f.id === fileId);
        if (file && file.unit_cost > 0) {
          const selectedAA = selection.administrativeApprovalId
            ? approvedAAs.find((a) => a.id === selection.administrativeApprovalId && a.budget_file_id === fileId)
            : null;
          const aaCost = selectedAA ? selectedAA.total_cost : 0;
          const availableAmount = (file.available_balance ?? file.available_amount) + aaCost;

          const maxQty = Math.floor(availableAmount / file.unit_cost);
          if (maxQty <= 0) return `Budget for "${file.item_name}" is exhausted. Please select a different budget file.`;
          const qty = Number(item.quantity);
          if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) return `Quantity for "${file.item_name}" must be a valid positive integer`;
          if (qty > maxQty) return `Requested quantity for "${file.item_name}" (${qty}) exceeds the maximum available quantity (${maxQty}) based on available budget`;
        } else {
          const qty = Number(item.quantity);
          if (isNaN(qty) || qty < 1 || !Number.isInteger(qty)) return `Quantity for all items must be a valid positive integer`;
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
        if (!isGem && !item.gem_nac_file && !item.replicated_gem_nac_path) return `GeM NAC certificate required for non-GeM procurement`;
        if (!item.availability) return `Select department availability for all items`;
        if (fieldVisible({ field: 'availability', equals: 'Yes' }, ctx)) {
          if (!item.present_stock.trim() || !item.justification_for_procurement.trim() || !item.previous_file_no_reference.trim()) {
            return `Complete department availability details for all applicable items`;
          }
        }
        if (!item.tech_specs_text.trim()) return `Enter technical specifications for all items`;
        if (!item.tech_specs_file && !item.replicated_tech_specs_path) return `Upload tech spec PDF for all items`;
        if (!item.equipment_name.trim()) return `Enter name of equipment for all items`;
        if (!item.pdi_required) return `Select pre-dispatch inspection requirement for all items`;
        if (item.pdi_required === 'Yes' && !item.pdi_justification.trim()) return `Provide justification for pre-dispatch inspection`;
        if (!item.pre_bid_required) return `Select pre-bid meeting requirement for all items`;
        if (item.installation_required === 'Yes' && !item.installation_scope) return `Select scope of installation for all items`;
        if (!item.training_required) return `Select training requirement for all items`;
        if (item.training_required === 'Yes' && !item.training_location) return `Select training location for all items`;
        if (!item.tech_eligibility.trim()) return `Enter technical eligibility criteria for all items`;
      }
      return null;
    },
    [items, selection.selectedFileIds]
  );

  const validateCommon = useCallback((totalCost: number = 0, formSchema?: any, procurementName?: string, isHod?: boolean): string | null => {
    if (isHod && !common.initiator_id) {
      return 'Please select a Purchase Initiator';
    }
    const isPac = procurementName && (procurementName.toLowerCase().includes('proprietary') || procurementName.toLowerCase().includes('pac'));
    if (isPac) {
      if (!common.dept_pac_file && !common.replicated_dept_pac_path) return 'Department PAC (PDF) is required for Proprietary Purchase';
      if (!common.oem_pac_file && !common.replicated_oem_pac_path) return 'OEM PAC Certificate (PDF) is required for Proprietary Purchase';
      if (!common.oem_auth_file && !common.replicated_oem_auth_path) return 'OEM Authorization Certificate (PDF) is required for Proprietary Purchase';
    }
    if (formSchema && formSchema.required && formSchema.properties) {
      const formData = common.form_data || {};
      const sectionTitle = formSchema.title ? `"${formSchema.title}"` : 'Procurement-Specific Details';
      for (const fieldName of formSchema.required) {
        const value = formData[fieldName];
        const prop = formSchema.properties[fieldName];
        const title = (prop?.title || fieldName).replace(/\s*\*\s*$/, '');
        if (value === undefined || value === null || String(value).trim() === '') {
          return `Please fill in "${title}" in the ${sectionTitle} section at the top of this page`;
        }
      }
    }
    if (!common.purchase_type) return 'Select a purchase type';
    if (!common.laboratory_office.trim()) return 'Enter laboratory/office name';
    if (!common.source_of_fund) return 'Select source of fund';
    if (common.source_of_fund === 'Project code' && !common.source_of_fund_project_code.trim()) return 'Enter project code details';
    if (common.source_of_fund === 'Others' && !common.source_of_fund_others.trim()) return 'Enter source of fund details';
    if (!common.item_category) return 'Select item category';
    if (!common.basis_of_estimate) return 'Select basis of estimation';
    if (common.basis_of_estimate === 'Others' && !common.basis_of_estimate_others.trim()) return 'Enter details for basis of estimation';
    if (!common.quotation_file && !common.replicated_quotation_path) return 'Upload basis of estimation PDF';
    if (!common.emd) return 'Select EMD percentage';
    if (!common.performance_security) return 'Select performance security percentage';
    if (!common.delivery_location.trim()) return 'Enter delivery location';
    if (!common.delivery_mode.trim()) return 'Enter delivery mode';
    if (!common.purpose) return 'Select purpose';
    if (common.purpose === 'Others' && !common.purpose_justification.trim()) return 'Enter purpose justification';
    if (totalCost > 500000) {
      if (!common.mii_clause) return 'Select Make in India clause applicability';
      if (common.mii_clause === 'Not Applicable' && !common.mii_justification.trim()) return 'Enter justification for MII Not Applicable';
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

  const hasDraft = useMemo(() => !!draft && draft.stepIndex > 0, [draft]);

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
    clearDraft,
    dismissFileWarning,
    filesNeedReupload,
    hasDraft,
  };
}
