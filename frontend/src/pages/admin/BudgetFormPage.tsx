import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Loader2, Plus, Check, Trash2 } from 'lucide-react';
import { adminApi } from '../../services/api';
import { toast } from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export const BudgetFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  // Form states
  const [departmentId, setDepartmentId] = useState<number>(0);
  const [financialYearId, setFinancialYearId] = useState<number>(0);
  const [expenditureCategory, setExpenditureCategory] = useState<string>('CAPEX');
  const [category, setCategory] = useState<string>('computer');
  const [itemName, setItemName] = useState<string>('');
  const [unitCost, setUnitCost] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);
  const [fileNo, setFileNo] = useState<string>('');
  const [isAutoRolling, setIsAutoRolling] = useState<boolean>(!isEdit);

  // Modal / Inline states for adding custom categories
  const [newExpVal, setNewExpVal] = useState<string>('');
  const [newItemVal, setNewItemVal] = useState<string>('');
  const [showAddExp, setShowAddExp] = useState<boolean>(false);
  const [showAddItem, setShowAddItem] = useState<boolean>(false);
  const [pendingCatType, setPendingCatType] = useState<'expenditure' | 'item' | null>(null);
  const [pendingCatValue, setPendingCatValue] = useState<string>('');

  // Queries
  const { data: depts = [], isLoading: loadingDepts } = useQuery({
    queryKey: ['admin_departments'],
    queryFn: () => adminApi.departments().then(res => res.data),
  });

  const { data: fys = [], isLoading: loadingFys } = useQuery({
    queryKey: ['admin_financial_years'],
    queryFn: () => adminApi.financialYears().then(res => res.data),
  });

  const { data: cats = { expenditure_categories: ['CAPEX', 'OPEX'], item_categories: ['computer', 'lab_equipment', 'software', 'furniture'] }, isLoading: loadingCats } = useQuery({
    queryKey: ['budget_categories'],
    queryFn: () => adminApi.getCategories().then(res => res.data),
  });

  // Fetch budget detail if editing
  const { data: budgetDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['budget_detail', id],
    queryFn: () => adminApi.getBudgetDetail(Number(id)).then(res => res.data),
    enabled: isEdit,
  });

  // Populate form if editing
  useEffect(() => {
    if (isEdit && budgetDetail) {
      setDepartmentId(budgetDetail.department_id);
      setFinancialYearId(budgetDetail.financial_year_id);
      setExpenditureCategory(budgetDetail.expenditure_category);
      setCategory(budgetDetail.category);
      setItemName(budgetDetail.item_name);
      setUnitCost(budgetDetail.unit_cost);
      setQuantity(budgetDetail.quantity);
      setFileNo(budgetDetail.file_no);
      // For existing files, default auto-rolling to false so we don't accidentally overwrite their file number
      setIsAutoRolling(false);
    }
  }, [isEdit, budgetDetail]);

  // Set initial department and financial year if creating
  useEffect(() => {
    if (!isEdit && depts.length > 0 && departmentId === 0) {
      setDepartmentId(depts[0].id);
    }
  }, [isEdit, depts, departmentId]);

  useEffect(() => {
    if (!isEdit && fys.length > 0 && financialYearId === 0) {
      const activeFy = fys.find((f: any) => f.is_active) || fys[0];
      if (activeFy) setFinancialYearId(activeFy.id);
    }
  }, [isEdit, fys, financialYearId]);

  // Auto-roll file number
  useEffect(() => {
    if (isAutoRolling && departmentId && expenditureCategory && financialYearId) {
      adminApi.getNextFileNumber({
        department_id: departmentId,
        expenditure_category: expenditureCategory,
        financial_year_id: financialYearId,
      })
      .then(res => {
        if (res.data && res.data.file_no) {
          setFileNo(res.data.file_no);
        }
      })
      .catch(err => {
        console.error('Error fetching auto-rolled file number:', err);
      });
    }
  }, [isAutoRolling, departmentId, expenditureCategory, financialYearId]);

  // Mutations
  const addCategoryMutation = useMutation({
    mutationFn: (payload: { type: 'expenditure' | 'item'; value: string }) => adminApi.addCategory(payload),
    onSuccess: (res) => {
      // res is the full Axios response; extract .data to match how the query caches it
      const updated = res.data;
      toast.success('Category added successfully');
      queryClient.setQueryData(['budget_categories'], updated);
      setShowAddExp(false);
      setShowAddItem(false);
      // Select the newly added value using the confirmed stored value
      if (pendingCatType === 'expenditure' && pendingCatValue) {
        setExpenditureCategory(pendingCatValue);
      } else if (pendingCatType === 'item' && pendingCatValue) {
        setCategory(pendingCatValue);
      }
      setNewExpVal('');
      setNewItemVal('');
      setPendingCatType(null);
      setPendingCatValue('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to add category');
      setPendingCatType(null);
      setPendingCatValue('');
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (payload: { type: 'expenditure' | 'item'; value: string }) =>
      adminApi.deleteBudgetCategory(payload.type, payload.value),
    onSuccess: (res) => {
      const updated = res.data;
      toast.success('Category deleted successfully');
      queryClient.setQueryData(['budget_categories'], updated);
      
      // Reset selected category to a default if the deleted one was selected
      if (pendingCatType === 'expenditure' && pendingCatValue) {
        if (expenditureCategory === pendingCatValue) {
          setExpenditureCategory(updated.expenditure_categories?.[0] || 'CAPEX');
        }
      } else if (pendingCatType === 'item' && pendingCatValue) {
        if (category === pendingCatValue) {
          setCategory(updated.item_categories?.[0] || 'computer');
        }
      }
      setPendingCatType(null);
      setPendingCatValue('');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete category');
      setPendingCatType(null);
      setPendingCatValue('');
    },
  });

  const handleDeleteCategory = (type: 'expenditure' | 'item', value: string) => {
    if (!window.confirm(`Are you sure you want to delete the category "${value}"?`)) return;
    setPendingCatType(type);
    setPendingCatValue(value);
    deleteCategoryMutation.mutate({ type, value });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (isEdit) {
        return adminApi.updateBudget(Number(id), data);
      }
      return adminApi.createBudget(data);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Budget file updated successfully' : 'Budget file created successfully');
      queryClient.invalidateQueries({ queryKey: ['admin_budgets'] });
      navigate('/budget');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to save budget');
    },
  });

  const handleAddCustomExp = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newExpVal.trim();
    if (!trimmed) return;
    setPendingCatType('expenditure');
    setPendingCatValue(trimmed);
    addCategoryMutation.mutate({ type: 'expenditure', value: trimmed });
  };

  const handleAddCustomItem = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newItemVal.trim();
    if (!trimmed) return;
    setPendingCatType('item');
    setPendingCatValue(trimmed);
    addCategoryMutation.mutate({ type: 'item', value: trimmed });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!departmentId || !financialYearId || !expenditureCategory || !category || !itemName || !fileNo) {
      toast.error('Please fill in all required fields');
      return;
    }
    const payload = {
      department_id: departmentId,
      financial_year_id: financialYearId,
      expenditure_category: expenditureCategory,
      category: category,
      item_name: itemName,
      unit_cost: unitCost,
      quantity: quantity,
      file_no: fileNo,
    };
    saveMutation.mutate(payload);
  };

  const totalCost = unitCost * quantity;

  if (loadingDepts || loadingFys || loadingCats || (isEdit && loadingDetail)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 size={36} className="animate-spin text-[#1a3a6b]" />
        <span className="text-slate-600 font-medium">Loading budget form...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 py-6">
      {/* Page Header */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/budget')}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="Back to budget list"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              {isEdit ? 'Modify Budget Master File' : 'Initiate New Budget File'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isEdit ? `Update properties for file: ${fileNo}` : 'Provide file criteria, standard expenditure class, and item allocations.'}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Form Column */}
        <div className="md:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="card bg-white border border-slate-200 p-6 space-y-5 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Department */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Department <span className="text-rose-500">*</span>
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(Number(e.target.value))}
                  disabled={isEdit}
                  required
                  className="input-field w-full disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value={0}>Select Department...</option>
                  {depts.map((d: any) => (
                    <option key={d.id} value={d.id}>
                      {d.short_code} - {d.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Financial Year */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Financial Year <span className="text-rose-500">*</span>
                </label>
                <select
                  value={financialYearId}
                  onChange={(e) => setFinancialYearId(Number(e.target.value))}
                  disabled={isEdit}
                  required
                  className="input-field w-full disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value={0}>Select Financial Year...</option>
                  {fys.map((f: any) => (
                    <option key={f.id} value={f.id}>
                      {f.label} {f.is_active ? '(Active)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Expenditure Category */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-semibold text-slate-700">
                    Expenditure Category <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    {isAdmin() && cats.added_by_dean?.expenditure?.includes(expenditureCategory) && !isEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory('expenditure', expenditureCategory)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-0.5"
                        disabled={deleteCategoryMutation.isPending}
                      >
                        <Trash2 size={12} /> Delete Selected
                      </button>
                    )}
                    {!showAddExp && (
                      <button
                        type="button"
                        onClick={() => setShowAddExp(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
                      >
                        <Plus size={12} /> Add New
                      </button>
                    )}
                  </div>
                </div>
                {showAddExp ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New category..."
                      value={newExpVal}
                      onChange={(e) => setNewExpVal(e.target.value)}
                      className="input-field flex-1 text-sm py-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomExp}
                      className="btn-primary py-1 px-3 text-xs"
                      disabled={addCategoryMutation.isPending}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddExp(false)}
                      className="btn-secondary py-1 px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <select
                    value={expenditureCategory}
                    onChange={(e) => setExpenditureCategory(e.target.value)}
                    disabled={isEdit}
                    required
                    className="input-field w-full disabled:bg-slate-50"
                  >
                    {cats.expenditure_categories?.map((cat: string) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Item Category */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-semibold text-slate-700">
                    Item Category <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    {isAdmin() && cats.added_by_dean?.item?.includes(category) && !isEdit && (
                      <button
                        type="button"
                        onClick={() => handleDeleteCategory('item', category)}
                        className="text-xs text-rose-600 hover:text-rose-800 font-medium flex items-center gap-0.5"
                        disabled={deleteCategoryMutation.isPending}
                      >
                        <Trash2 size={12} /> Delete Selected
                      </button>
                    )}
                    {!showAddItem && (
                      <button
                        type="button"
                        onClick={() => setShowAddItem(true)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-0.5"
                      >
                        <Plus size={12} /> Add New
                      </button>
                    )}
                  </div>
                </div>
                {showAddItem ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="New category..."
                      value={newItemVal}
                      onChange={(e) => setNewItemVal(e.target.value)}
                      className="input-field flex-1 text-sm py-1"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomItem}
                      className="btn-primary py-1 px-3 text-xs"
                      disabled={addCategoryMutation.isPending}
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAddItem(false)}
                      className="btn-secondary py-1 px-3 text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    required
                    className="input-field w-full"
                  >
                    {cats.item_categories?.map((cat: string) => (
                      <option key={cat} value={cat}>
                        {cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Item Name */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">
                Item Name / Description <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Server Upgrades, Classroom Desks, Matlab License"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                required
                className="input-field w-full"
              />
            </div>

            {/* Financial Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Unit Cost (₹) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={unitCost}
                  onChange={(e) => setUnitCost(Number(e.target.value))}
                  required
                  className="input-field w-full font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">
                  Quantity <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                  required
                  className="input-field w-full font-mono text-sm"
                />
              </div>
            </div>

            {/* File Number and Auto-roll settings */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold text-slate-800">File Number / Budget Reference</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutoRolling}
                    onChange={(e) => setIsAutoRolling(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span className="text-xs font-medium text-slate-600">Auto-roll Reference</span>
                </label>
              </div>

              <input
                type="text"
                placeholder="NITT/DEPT/SRC/FY/NUM"
                value={fileNo}
                onChange={(e) => setFileNo(e.target.value)}
                disabled={isAutoRolling}
                required
                className="input-field w-full font-mono tracking-wider text-sm disabled:bg-slate-100 disabled:text-slate-600 border-dashed"
              />

              {isAutoRolling && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Check size={12} className="text-emerald-500" /> Pre-computed automatically using code: <code className="font-mono bg-slate-200 px-1 rounded">nitt/dept/source/fy/num</code>
                </p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => navigate('/budget')}
                className="btn-secondary px-5"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="btn-primary px-6 flex items-center gap-1.5"
              >
                {saveMutation.isPending ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save size={16} /> Save Budget File
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar Summary Column */}
        <div className="space-y-6">
          <div className="card bg-[#1a3a6b] text-white p-6 rounded-xl shadow-md space-y-4">
            <h3 className="text-sm font-semibold tracking-wider text-blue-200 uppercase">Cost Summary</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-blue-100">Unit Cost</span>
                <span className="font-mono text-lg font-medium">₹ {unitCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-sm text-blue-100">Quantity</span>
                <span className="font-mono text-lg font-medium">× {quantity}</span>
              </div>
              <div className="border-t border-blue-500/50 pt-3 flex justify-between items-baseline">
                <span className="text-base font-bold text-white">Total Allocated</span>
                <span className="font-mono text-2xl font-bold text-amber-300">
                  ₹ {totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          <div className="card bg-white border border-slate-200 p-5 rounded-xl text-xs text-slate-500 space-y-2 shadow-sm">
            <h4 className="font-semibold text-slate-800 text-sm">Budget File Rules</h4>
            <p>• File numbers are standardized to prevent duplicate tracking of departmental items.</p>
            <p>• Expenditure source category must be standard (e.g. CAPEX/OPEX) or registered through Dean approval.</p>
            <p>• Once a budget is created, HODs or Admin can assign the Technical Committee nominations on the primary budget workspace.</p>
          </div>
        </div>
      </div>
    </div>
  );
};
