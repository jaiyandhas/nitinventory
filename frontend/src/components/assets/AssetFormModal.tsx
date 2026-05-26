import React, { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { User, Department } from '../../types';

interface AssetFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  isHod: boolean;
  isAdmin: boolean;
  user: User | null;
  departments: Department[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}

export const AssetFormModal: React.FC<AssetFormModalProps> = ({
  isOpen,
  onClose,
  isHod,
  isAdmin,
  user,
  departments,
  onSubmit,
  isPending,
}) => {
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

  // Pre-fill department if HOD
  useEffect(() => {
    if (user?.department?.id) {
      setDeptId(user.department.id.toString());
    }
  }, [user]);

  // Keep year and purchase date correlated
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

  const getDeptShortCode = () => {
    if (isHod) {
      return user?.department?.short_code || 'DEPT';
    }
    const d = departments.find((dept: any) => dept.id === parseInt(deptId));
    return d?.short_code || 'DEPT';
  };

  const previewTag = `NIT-${getDeptShortCode()}-${year ? year.slice(-2) : 'YY'}-XXX`;

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      year,
      legacyAssetTag,
      fundSource,
      name,
      category,
      building,
      room,
      custodian,
      serialNumber,
      condition,
      purchaseDate,
      unitCost,
      warrantyExpiry,
      deptId,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Register Asset</h2>
            <p className="text-xs text-slate-500">Add an existing physical asset into the database</p>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>
        
        <form onSubmit={handleSubmitForm} className="flex-1 overflow-y-auto p-6 space-y-4">
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
              {isHod ? (
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
              onClick={onClose} 
              className="btn-secondary py-2"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isPending} 
              className="btn-primary py-2 px-6 flex items-center gap-2"
            >
              {isPending ? (
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
  );
};
