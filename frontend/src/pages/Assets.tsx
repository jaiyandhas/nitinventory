import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi, authApi } from '../services/api';
import { Asset } from '../types';
import { Link, useParams } from 'react-router-dom';
import { Package, QrCode, Plus, X, Loader2, Search, Filter, IndianRupee, Upload, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';

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

  // Form states
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [legacyAssetTag, setLegacyAssetTag] = useState('');
  const [fundSource, setFundSource] = useState('plan_fund');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('lab_equipment');
  const [building, setBuilding] = useState('');
  const [room, setRoom] = useState('');
  const [custodian, setCustodian] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [condition, setCondition] = useState('working');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [deptId, setDeptId] = useState('');

  // CSV Import states
  const [csvFile, setCsvFile] = useState<File | null>(null);
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

  // Pre-fill department if HOD
  React.useEffect(() => {
    if (user?.department?.id) {
      setDeptId(user.department.id.toString());
    }
  }, [user]);

  // Form helpers to keep year and purchase date correlated
  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    if (newYear.length === 4 && /^\d{4}$/.test(newYear)) {
      if (purchaseDate) {
        const dateParts = purchaseDate.split('-');
        if (dateParts.length === 3) {
          setPurchaseDate(`${newYear}-${dateParts[1]}-${dateParts[2]}`);
        }
      } else {
        setPurchaseDate(`${newYear}-01-01`);
      }
    }
  };

  const handlePurchaseDateChange = (newDate: string) => {
    setPurchaseDate(newDate);
    if (newDate) {
      const dateParts = newDate.split('-');
      if (dateParts.length === 3 && dateParts[0].length === 4) {
        setYear(dateParts[0]);
      }
    }
  };

  const registerMutation = useMutation({
    mutationFn: (data: any) => assetsApi.create(data),
    onSuccess: (res: any) => {
      toast.success(res.data.message || 'Asset registered successfully');
      setIsModalOpen(false);
      // Reset form
      setYear(new Date().getFullYear().toString());
      setLegacyAssetTag('');
      setFundSource('plan_fund');
      setName('');
      setCategory('lab_equipment');
      setBuilding('');
      setRoom('');
      setCustodian('');
      setSerialNumber('');
      setCondition('working');
      setPurchaseDate('');
      setUnitCost('');
      setWarrantyExpiry('');
      if (!isHod()) {
        setDeptId('');
      }
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
      setCsvFile(null);
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

  const handleCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile) {
      toast.error('Please select a CSV file');
      return;
    }
    const formData = new FormData();
    formData.append('file', csvFile);
    importMutation.mutate(formData);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Asset Name is required');
    if (!legacyAssetTag.trim()) return toast.error('Existing Asset Number is required');
    if (!year.trim()) return toast.error('Year is required');
    if (!deptId) return toast.error('Department is required');

    registerMutation.mutate({
      year: parseInt(year),
      legacy_asset_tag: legacyAssetTag,
      fund_source: fundSource,
      name,
      category,
      building: building || undefined,
      room: room || undefined,
      custodian: custodian || undefined,
      serial_number: serialNumber || undefined,
      condition,
      purchase_date: purchaseDate || undefined,
      unit_cost: unitCost ? parseFloat(unitCost) : undefined,
      warranty_expiry: warrantyExpiry || undefined,
      department_id: parseInt(deptId),
    });
  };

  const getDeptShortCode = () => {
    if (isHod()) {
      return user?.department?.short_code || 'DEPT';
    }
    const d = departments.find((dept: any) => dept.id === parseInt(deptId));
    return d?.short_code || 'DEPT';
  };

  const previewTag = `NIT-${getDeptShortCode()}-${year ? year.slice(-2) : 'YY'}-XXX`;

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
                setCsvFile(null);
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
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold">Asset Tag</th>
                <th className="text-left px-5 py-3 font-semibold">Asset Name</th>
                <th className="text-left px-5 py-3 font-semibold">Location</th>
                <th className="text-left px-5 py-3 font-semibold">Custodian</th>
                <th className="text-left px-5 py-3 font-semibold">Funding Type</th>
                <th className="text-left px-5 py-3 font-semibold">Unit Cost</th>
                <th className="text-left px-5 py-3 font-semibold">Condition</th>
                <th className="text-left px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredAssets.map((asset: Asset) => (
                <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3 font-mono text-xs">
                    <div className="font-bold text-slate-700">{asset.asset_tag}</div>
                    {asset.legacy_asset_tag && (
                      <div className="text-[10px] text-slate-400 font-semibold mt-0.5">
                        Prev: {asset.legacy_asset_tag}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <div className="font-bold text-[#1a3a6b]">{asset.name}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      Category: {asset.category?.replace('_', ' ')}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{asset.building || '—'} · {asset.room || '—'}</td>
                  <td className="px-5 py-3 text-slate-600">{asset.custodian || '—'}</td>
                  <td className="px-5 py-3 text-slate-600 capitalize">
                    {asset.fund_source?.replace(/_/g, ' ') || 'Plan Fund'}
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {asset.unit_cost !== null && asset.unit_cost !== undefined ? (
                      <span className="flex items-center text-xs font-semibold">
                        <IndianRupee size={12} /> {asset.unit_cost.toLocaleString('en-IN')}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <span className={`status-badge ${CONDITION_COLORS[asset.condition] || ''}`}>
                      {asset.condition.replace('_', ' ').toUpperCase()}
                    </span>
                  </td>
                  <td className="px-5 py-3 flex items-center gap-2">
                    <Link to={`/assets/${asset.id}`} className="text-xs font-semibold text-[#1a3a6b] hover:underline">
                      View
                    </Link>
                    {asset.qr_code_url && (
                      <a href={asset.qr_code_url} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-[#1a3a6b]" title="View QR">
                        <QrCode size={14} />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
              {filteredAssets.length === 0 && (
                <tr>
                  <td colSpan={8} className="text-center py-10 text-slate-500 text-sm font-medium">
                    No assets match your search/filter parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Register Asset Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Register Asset</h2>
                <p className="text-xs text-slate-500">Add an existing physical asset into the database</p>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Asset Year *</label>
                  <input 
                    type="number" 
                    value={year} 
                    onChange={e => handleYearChange(e.target.value)} 
                    min="1990" 
                    max="2100" 
                    className="input-field w-full" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Existing Asset / Reference Number *</label>
                  <input 
                    type="text" 
                    value={legacyAssetTag} 
                    onChange={e => setLegacyAssetTag(e.target.value)} 
                    placeholder="e.g. OLD-TAG-123" 
                    className="input-field w-full" 
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Asset Tag Preview</label>
                  <input 
                    type="text" 
                    value={previewTag} 
                    className="input-field w-full bg-slate-100 text-slate-500 cursor-not-allowed font-mono text-xs font-bold" 
                    disabled 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Department *</label>
                  {isHod() ? (
                    <input 
                      type="text" 
                      value={user?.department?.name || ''} 
                      className="input-field w-full bg-slate-100 text-slate-500 cursor-not-allowed" 
                      disabled 
                    />
                  ) : (
                    <select 
                      value={deptId} 
                      onChange={e => setDeptId(e.target.value)} 
                      className="input-field w-full"
                      required
                    >
                      <option value="">Select Department...</option>
                      {departments.map((d: any) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Asset Name *</label>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={e => setName(e.target.value)} 
                    placeholder="e.g. High-Performance GPU Workstation" 
                    className="input-field w-full" 
                    required 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Category *</label>
                  <select 
                    value={category} 
                    onChange={e => setCategory(e.target.value)} 
                    className="input-field w-full"
                  >
                    <option value="lab_equipment">Lab Equipment</option>
                    <option value="furniture">Furniture</option>
                    <option value="computer">Computer</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Funding Source *</label>
                  <select 
                    value={fundSource} 
                    onChange={e => setFundSource(e.target.value)} 
                    className="input-field w-full"
                  >
                    <option value="plan_fund">Plan Fund</option>
                    <option value="non_plan_fund">Non-Plan Fund</option>
                    <option value="research_fund">Research Fund</option>
                    <option value="consultancy_fund">Consultancy Fund</option>
                    <option value="dept_development_fund">DDF</option>
                    <option value="others">Others</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Unit Cost (₹)</label>
                  <input 
                    type="number" 
                    value={unitCost} 
                    onChange={e => setUnitCost(e.target.value)} 
                    placeholder="e.g. 85000" 
                    className="input-field w-full" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Building Location</label>
                  <input 
                    type="text" 
                    value={building} 
                    onChange={e => setBuilding(e.target.value)} 
                    placeholder="e.g. CSE Block" 
                    className="input-field w-full" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Room Location</label>
                  <input 
                    type="text" 
                    value={room} 
                    onChange={e => setRoom(e.target.value)} 
                    placeholder="e.g. Lab 2" 
                    className="input-field w-full" 
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Custodian / In-Charge</label>
                  <input 
                    type="text" 
                    value={custodian} 
                    onChange={e => setCustodian(e.target.value)} 
                    placeholder="e.g. Dr. A. Kumar" 
                    className="input-field w-full" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Serial Number</label>
                  <input 
                    type="text" 
                    value={serialNumber} 
                    onChange={e => setSerialNumber(e.target.value)} 
                    placeholder="e.g. SN123456789" 
                    className="input-field w-full" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Condition *</label>
                  <select 
                    value={condition} 
                    onChange={e => setCondition(e.target.value)} 
                    className="input-field w-full"
                  >
                    <option value="working">Working</option>
                    <option value="damaged">Damaged</option>
                    <option value="under_repair">Under Repair</option>
                    <option value="obsolete">Obsolete</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Purchase Date</label>
                  <input 
                    type="date" 
                    value={purchaseDate} 
                    onChange={e => handlePurchaseDateChange(e.target.value)} 
                    className="input-field w-full text-slate-600" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Warranty Expiry</label>
                  <input 
                    type="date" 
                    value={warrantyExpiry} 
                    onChange={e => setWarrantyExpiry(e.target.value)} 
                    className="input-field w-full text-slate-600" 
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)} 
                  className="btn-secondary py-2"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={registerMutation.isPending} 
                  className="btn-primary py-2 px-6 flex items-center gap-2"
                >
                  {registerMutation.isPending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Registering...
                    </>
                  ) : (
                    'Register Asset'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Upload CSV Modal */}
      {isCsvModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-[#1a3a6b] text-white">
              <div>
                <h2 className="text-lg font-bold">Bulk Upload Assets CSV</h2>
                <p className="text-xs text-blue-100">Upload multiple assets at once using a CSV file</p>
              </div>
              <button
                onClick={() => {
                  setIsCsvModalOpen(false);
                  setCsvFile(null);
                  setImportErrors([]);
                }}
                className="text-white hover:text-slate-200 font-bold text-lg"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Template Download Section */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">CSV Import Template</p>
                  <p className="text-xs text-slate-500">Download the structure before uploading your data</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const headers = [
                      'year',
                      'legacy_asset_tag',
                      'name',
                      'category',
                      'fund_source',
                      'unit_cost',
                      'condition',
                      'building',
                      'room',
                      'custodian',
                      'serial_number',
                      'purchase_date',
                      'warranty_expiry',
                      'department_code'
                    ];
                    const sampleRow = [
                      '2026',
                      'OLD-TAG-CSE-001',
                      'Lab Workstation HP Z2',
                      'computer',
                      'research_fund',
                      '95000',
                      'working',
                      'CSE Block',
                      'Lab 3',
                      'Dr. K. Aravind',
                      'SGH123456',
                      '2026-05-15',
                      '2029-05-15',
                      'CSE'
                    ];
                    const csvContent = "data:text/csv;charset=utf-8," 
                      + [headers.join(','), sampleRow.join(',')].join('\n');
                    const encodedUri = encodeURI(csvContent);
                    const link = document.createElement("a");
                    link.setAttribute("href", encodedUri);
                    link.setAttribute("download", "assets_bulk_import_template.csv");
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  }}
                  className="btn-secondary flex items-center gap-1.5 text-xs py-1.5 px-3 border-slate-300 hover:bg-slate-100"
                >
                  <Upload size={14} /> Sample CSV
                </button>
              </div>

              {/* Guidelines */}
              <div className="text-xs text-slate-600 space-y-2 bg-blue-50 border border-blue-100 rounded-lg p-4">
                <p className="font-semibold text-blue-800">CSV Upload Guidelines:</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li><strong>Required fields:</strong> <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">name</code> and <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">legacy_asset_tag</code>.</li>
                  <li><strong>Date fields:</strong> Formatted as YYYY-MM-DD or DD-MM-YYYY (e.g. 2026-05-26).</li>
                  <li><strong>Cost fields:</strong> Numbers only, currency symbol/commas will be stripped.</li>
                  <li><strong>Category values:</strong> <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">computer</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">lab_equipment</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">furniture</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">other</code>.</li>
                  <li><strong>Funding sources:</strong> <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">plan_fund</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">non_plan_fund</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">research_fund</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">consultancy_fund</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">dept_development_fund</code>, <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">others</code>.</li>
                  {isAdmin() && (
                    <li><strong>Admins only:</strong> <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">department_code</code> (e.g. CSE, EEE, MECH) or ID is required.</li>
                  )}
                  {!isAdmin() && (
                    <li><strong>HODs only:</strong> Assets will automatically be assigned to your department.</li>
                  )}
                  <li className="text-[#a30000] font-semibold">Note: The entire CSV import is atomic. If any single row fails validation, the database transaction rolls back completely and no assets are registered.</li>
                </ul>
              </div>

              {/* Error messages if any */}
              {importErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 text-xs space-y-2 max-h-48 overflow-y-auto">
                  <div className="font-bold flex items-center gap-1.5 text-red-900">
                    <AlertCircle size={14} />
                    Import Errors Encountered ({importErrors.length}):
                  </div>
                  <ul className="list-disc pl-4 space-y-1">
                    {importErrors.map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleCsvSubmit} className="space-y-4 pt-2">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Select CSV File *</label>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={e => setCsvFile(e.target.files?.[0] || null)}
                    required
                    className="input-field w-full text-slate-600"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCsvModalOpen(false);
                      setCsvFile(null);
                      setImportErrors([]);
                    }}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={importMutation.isPending}
                    className="btn-primary flex items-center gap-2"
                  >
                    {importMutation.isPending ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Importing...
                      </>
                    ) : (
                      <>
                        <Upload size={16} /> Upload CSV
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
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
