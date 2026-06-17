import React, { useState } from 'react';
import { XCircle } from 'lucide-react';
import { prApi } from '../../../services/api';
import toast from 'react-hot-toast';

interface CancelPOModalProps {
  prId: number;
  cancelType: 'tender' | 'po' | null;
  onClose: () => void;
  refetch: () => void;
  actionLoading: boolean;
  setActionLoading: (loading: boolean) => void;
}

export const CancelPOModal: React.FC<CancelPOModalProps> = ({
  prId,
  cancelType,
  onClose,
  refetch,
  actionLoading,
  setActionLoading
}) => {
  const [cancelReason, setCancelReason] = useState('');
  const [reinitiationMethod, setReinitiationMethod] = useState('none');
  const [reallocatedAmount, setReallocatedAmount] = useState('0');

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      toast.error('Cancellation reason is required.');
      return;
    }
    setActionLoading(true);
    try {
      if (cancelType === 'po') {
        await prApi.cancelPo(prId, cancelReason, reinitiationMethod, Number(reallocatedAmount));
        toast.success('Purchase Order cancelled successfully!');
      } else {
        await prApi.cancelTender(prId, cancelReason, reinitiationMethod);
        toast.success('Tender process cancelled successfully!');
      }
      onClose();
      refetch();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Failed to cancel request');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn text-left">
      <div className="bg-white rounded-lg shadow-lg border border-slate-200 max-w-md w-full p-6 space-y-4">
        <h3 className="text-base font-bold text-slate-800 flex items-center gap-1.5">
          <XCircle size={18} className="text-red-600" /> Cancel {cancelType === 'po' ? 'Purchase Order (PO)' : 'Tender Process'}
        </h3>
        
        <div>
          <label className="label text-slate-600 font-bold block mb-1">Reason for Cancellation *</label>
          <textarea 
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Provide a detailed justification for cancellation..."
            className="input-field w-full mt-1 resize-none bg-white"
            rows={3}
            required
          />
        </div>

        <div>
          <label className="label text-slate-600 font-bold block mb-1">Re-initiation Method Preference</label>
          <select 
            value={reinitiationMethod} 
            onChange={(e) => setReinitiationMethod(e.target.value)}
            className="input-field w-full mt-1 bg-white"
          >
            <option value="none">None (Do not re-initiate)</option>
            <option value="direct">Direct Purchase</option>
            <option value="gem">GeM Procurement</option>
            <option value="limited">Limited Tender</option>
            <option value="cppp">CPPP Portal</option>
          </select>
        </div>

        {cancelType === 'po' && (
          <div>
            <label className="label text-slate-600 font-bold block mb-1">Reallocated Budget Amount (if any)</label>
            <input 
              type="number"
              value={reallocatedAmount}
              onChange={(e) => setReallocatedAmount(e.target.value)}
              placeholder="0"
              className="input-field w-full mt-1 bg-white"
              min="0"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button 
            type="button" 
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 rounded text-slate-600 hover:bg-slate-50 font-medium"
          >
            Cancel
          </button>
          <button 
            type="button" 
            onClick={handleConfirmCancel}
            disabled={actionLoading || !cancelReason.trim()}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded flex items-center gap-1.5"
          >
            Confirm Cancellation
          </button>
        </div>
      </div>
    </div>
  );
};
