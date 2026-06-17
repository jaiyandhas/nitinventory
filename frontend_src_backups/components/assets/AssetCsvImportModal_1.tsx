import React, { useState } from 'react';
import { X, Loader2, Upload, AlertCircle } from 'lucide-react';

interface AssetCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onSubmit: (file: File) => void;
  isPending: boolean;
  importErrors: string[];
}

export const AssetCsvImportModal: React.FC<AssetCsvImportModalProps> = ({
  isOpen,
  onClose,
  isAdmin,
  onSubmit,
  isPending,
  importErrors,
}) => {
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (csvFile) {
      onSubmit(csvFile);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-slate-200 flex justify-between items-center bg-[#1a3a6b] text-white">
          <div>
            <h2 className="text-lg font-bold">Bulk Upload Assets CSV</h2>
            <p className="text-xs text-blue-100">Upload multiple assets at once using a CSV file</p>
          </div>
          <button
            onClick={onClose}
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
              {isAdmin && (
                <li><strong>Admins only:</strong> <code className="bg-blue-100 px-1 py-0.5 rounded text-blue-900">department_code</code> (e.g. CSE, EEE, MECH) or ID is required.</li>
              )}
              {!isAdmin && (
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
          <form onSubmit={handleFormSubmit} className="space-y-4 pt-2">
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
                onClick={onClose}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="btn-primary flex items-center gap-2"
              >
                {isPending ? (
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
  );
};
