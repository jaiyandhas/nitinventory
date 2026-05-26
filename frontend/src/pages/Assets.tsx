import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi, authApi } from '../services/api';
import { Asset } from '../types';
import { Link, useParams } from 'react-router-dom';
import { Plus, Search, Filter, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

import { AssetFormModal } from '../components/assets/AssetFormModal';
import { AssetCsvImportModal } from '../components/assets/AssetCsvImportModal';
import { AssetTable } from '../components/assets/AssetTable';

const CONDITION_COLORS: Record<string, string> = {
  working: 'bg-green-100 text-green-800 border-green-300',
  damaged: 'bg-red-100 text-red-800 border-red-300',
  under_repair: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  obsolete: 'bg-slate-100 text-slate-800 border-slate-300',
};

export const AssetListPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user, isHod, isAdmin } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCsvModalOpen, setIsCsvModalOpen] = useState(false);

  // Search & Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterCondition, setFilterCondition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterFundSource, setFilterFundSource] = useState('');
  const [filterDept, setFilterDept] = useState('');

  // CSV Import states
  const [importErrors, setImportErrors] = useState<string[]>([]);

  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list().then(r => r.data),
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: () => authApi.departments().then(r => r.data),
    enabled: isAdmin(),
  });

  const registerMutation = useMutation({
    mutationFn: (data: any) => assetsApi.create(data),
    onSuccess: (res: any) => {
      toast.success(res.data.message || 'Asset registered successfully');
      setIsModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to register asset');
    }
  });

  const importMutation = useMutation({
    mutationFn: (formData: FormData) => assetsApi.importCsv(formData),
    onSuccess: (res: any) => {
      toast.success(res.data.message || 'Assets imported successfully!');
      setIsCsvModalOpen(false);
      setImportErrors([]);
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (err: any) => {
      const details = err.response?.data?.detail;
      if (details && typeof details === 'object' && details.errors) {
        setImportErrors(details.errors);
        toast.error(details.message || 'CSV Import Failed');
      } else {
        toast.error(err.response?.data?.detail || 'CSV upload failed');
      }
    }
  });

  const handleRegisterSubmit = (formData: any) => {
    if (!formData.name.trim()) return toast.error('Asset Name is required');
    if (!formData.legacyAssetTag.trim()) return toast.error('Existing Asset Number is required');
    if (!formData.year.trim()) return toast.error('Year is required');
    if (!formData.deptId) return toast.error('Department is required');

    registerMutation.mutate({
      year: parseInt(formData.year),
      legacy_asset_tag: formData.legacyAssetTag,
      fund_source: formData.fundSource,
      name: formData.name,
      category: formData.category,
      building: formData.building || undefined,
      room: formData.room || undefined,
      custodian: formData.custodian || undefined,
      serial_number: formData.serialNumber || undefined,
      condition: formData.condition,
      purchase_date: formData.purchaseDate || undefined,
      unit_cost: formData.unitCost ? parseFloat(formData.unitCost) : undefined,
      warranty_expiry: formData.warrantyExpiry || undefined,
      department_id: parseInt(formData.deptId),
    });
  };

  const handleCsvImportSubmit = (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    importMutation.mutate(formData);
  };

  const canRegister = isHod() || isAdmin();

  // Extract unique years from assets dynamically
  const uniqueYears = Array.from(new Set(assets.map(asset => {
    const parts = asset.asset_tag.split('-');
    if (parts.length >= 3) {
      const yy = parts[2];
      if (/^\d{2}$/.test(yy)) {
        return `20${yy}`;
      }
    }
    if (asset.purchase_date) {
      return new Date(asset.purchase_date).getFullYear().toString();
    }
    return null;
  }).filter(Boolean) as string[])).sort((a, b) => b.localeCompare(a));

  const filteredAssets = assets.filter(asset => {
    // Search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = asset.name.toLowerCase().includes(term);
      const matchTag = asset.asset_tag.toLowerCase().includes(term);
      const matchLegacy = asset.legacy_asset_tag?.toLowerCase().includes(term) || false;
      const matchSerial = asset.serial_number?.toLowerCase().includes(term) || false;
      const matchCustodian = asset.custodian?.toLowerCase().includes(term) || false;
      const matchBuilding = asset.building?.toLowerCase().includes(term) || false;
      const matchRoom = asset.room?.toLowerCase().includes(term) || false;
      
      if (!matchName && !matchTag && !matchLegacy && !matchSerial && !matchCustodian && !matchBuilding && !matchRoom) {
        return false;
      }
    }

    // Year filter
    if (filterYear) {
      const parts = asset.asset_tag.split('-');
      const yy = parts.length >= 3 ? parts[2] : '';
      const assetYear = yy ? `20${yy}` : (asset.purchase_date ? new Date(asset.purchase_date).getFullYear().toString() : '');
      if (assetYear !== filterYear) {
        return false;
      }
    }

    // Category filter
    if (filterCategory && asset.category !== filterCategory) return false;
    
    // Condition filter
    if (filterCondition && asset.condition !== filterCondition) return false;
    
    // Status filter
    if (filterStatus && asset.disposal_status !== filterStatus) return false;

    // Fund Source filter
    if (filterFundSource && asset.fund_source !== filterFundSource) return false;
    
    // Department filter (Admin only)
    if (isAdmin() && filterDept && asset.department_id !== parseInt(filterDept)) return false;

    return true;
  });

  return (
    <div className="space-y-5">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="page-header">Asset Directory</h1>
          <p className="page-subtitle">Centralized view of institutional assets</p>
        </div>
        {canRegister && (
          <div className="flex gap-3 text-sm">
            <button
              onClick={() => {
                setImportErrors([]);
                setIsCsvModalOpen(true);
              }}
              className="btn-secondary flex items-center gap-2 border-slate-300 px-4 py-2 hover:bg-slate-100 transition-all font-semibold"
            >
              <Upload size={16} /> Bulk Upload CSV
            </button>
            <button 
              onClick={() => setIsModalOpen(true)} 
              className="btn-primary flex items-center gap-2"
            >
              <Plus size={18} /> Register Asset
            </button>
          </div>
        )}
      </div>

      {/* Search & Filter Panel */}
      <div className="card p-4 bg-slate-50 border border-slate-200 shadow-sm rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-[#1a3a6b] font-bold text-xs border-b border-slate-200/60 pb-2">
          <Filter size={14} /> Filter Asset Records
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 items-center">
          {/* Search bar */}
          <div className="relative lg:col-span-2 col-span-1">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <Search size={16} />
            </span>
            <input
              type="text"
              placeholder="Search assets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-field w-full pl-9 text-sm"
            />
          </div>

          {/* Year Filter */}
          <div>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">All Years</option>
              {uniqueYears.map(yr => (
                <option key={yr} value={yr}>{yr}</option>
              ))}
            </select>
          </div>

          {/* Category Dropdown */}
          <div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">All Categories</option>
              <option value="lab_equipment">Lab Equipment</option>
              <option value="furniture">Furniture</option>
              <option value="computer">Computer</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Condition Dropdown */}
          <div>
            <select
              value={filterCondition}
              onChange={(e) => setFilterCondition(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">All Conditions</option>
              <option value="working">Working</option>
              <option value="damaged">Damaged</option>
              <option value="under_repair">Under Repair</option>
              <option value="obsolete">Obsolete</option>
            </select>
          </div>

          {/* Fund Source filter */}
          <div>
            <select
              value={filterFundSource}
              onChange={(e) => setFilterFundSource(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">All Funding</option>
              <option value="plan_fund">Plan Fund</option>
              <option value="non_plan_fund">Non-Plan Fund</option>
              <option value="research_fund">Research Fund</option>
              <option value="consultancy_fund">Consultancy Fund</option>
              <option value="dept_development_fund">DDF</option>
              <option value="others">Others</option>
            </select>
          </div>

          {/* Disposal Status Dropdown */}
          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="input-field w-full text-sm"
            >
              <option value="">All Disposal Statuses</option>
              <option value="active">Active</option>
              <option value="flagged">Flagged</option>
              <option value="disposed">Disposed</option>
            </select>
          </div>

          {/* Department Filter (Admin only) */}
          {isAdmin() && (
            <div>
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="input-field w-full text-sm"
              >
                <option value="">All Departments</option>
                {departments.map((d: any) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading assets...</div>
      ) : (
        <AssetTable filteredAssets={filteredAssets} conditionColors={CONDITION_COLORS} />
      )}

      {/* Register Asset Modal */}
      <AssetFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isHod={isHod()}
        isAdmin={isAdmin()}
        user={user}
        departments={departments}
        onSubmit={handleRegisterSubmit}
        isPending={registerMutation.isPending}
      />

      {/* Bulk Upload CSV Modal */}
      <AssetCsvImportModal
        isOpen={isCsvModalOpen}
        onClose={() => setIsCsvModalOpen(false)}
        isAdmin={isAdmin()}
        onSubmit={handleCsvImportSubmit}
        isPending={importMutation.isPending}
        importErrors={importErrors}
      />
    </div>
  );
};

// Public QR profile (no auth needed)
export const AssetPublicPage: React.FC = () => {
  const { tag } = useParams<Record<string, string>>();
  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset-public', tag],
    queryFn: () => assetsApi.publicProfile(tag!).then(r => r.data),
  });

  if (isLoading) return <div className="min-h-screen formal-bg flex items-center justify-center text-slate-600 font-medium">Loading details...</div>;
  if (!asset) return <div className="min-h-screen formal-bg flex items-center justify-center text-slate-500 font-medium">Asset not found or invalid QR code.</div>;

  return (
    <div className="min-h-screen formal-bg flex items-center justify-center p-4">
      <div className="card max-w-md w-full p-8 shadow-md">
        <div className="text-center mb-6">
          <img src="/NITLOGO.png" alt="NIT Logo" className="w-16 h-16 object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-[#1a3a6b]">{asset.name}</h1>
          <div className="text-slate-600 font-mono text-sm mt-1 font-bold">{asset.asset_tag}</div>
        </div>
        <div className="space-y-3 bg-slate-50 p-5 rounded border border-slate-200">
          {[
            ['Category', asset.category?.replace('_', ' ')],
            ['Existing Asset No.', asset.legacy_asset_tag || '—'],
            ['Funding Source', asset.fund_source?.replace('_', ' ') || '—'],
            ['Condition', asset.condition?.replace('_', ' ')],
            ['Location', [asset.building, asset.room].filter(Boolean).join(', ') || '—'],
            ['Custodian', asset.custodian || '—'],
            ['Serial No.', asset.serial_number || '—'],
            ['Purchase Date', asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : '—'],
            ['Warranty Expiry', asset.warranty_expiry ? new Date(asset.warranty_expiry).toLocaleDateString() : '—'],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between text-sm py-1 border-b border-slate-200 last:border-0">
              <span className="text-slate-500 font-semibold">{k}</span>
              <span className="text-slate-800 font-medium capitalize">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-8 pt-4 border-t border-slate-300 text-center text-xs font-medium text-slate-500">
          National Institute of Technology, Tiruchirappalli<br />
          NIT Inventory Asset Registry
        </div>
      </div>
    </div>
  );
};
