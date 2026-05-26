import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { assetsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { ArrowLeft, Edit, Trash2, ArrowRightLeft, Shield, MapPin, User as UserIcon, Calendar, IndianRupee, Activity } from 'lucide-react';

export const AssetDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  const isHod = user?.role?.group_key === 'hod';
  const isStores = user?.role?.group_key === 'verifier_sp';
  const isAdmin = user?.role?.group_key === 'admin';

  const { data: asset, isLoading } = useQuery({
    queryKey: ['asset', id],
    queryFn: () => assetsApi.get(Number(id)).then(res => res.data),
    enabled: !!id,
  });

  const updateConditionMutation = useMutation({
    mutationFn: (condition: string) => assetsApi.updateCondition(Number(id), condition),
    onSuccess: () => {
      toast.success('Condition updated');
      queryClient.invalidateQueries({ queryKey: ['asset', id] });
    }
  });

  const moveMutation = useMutation({
    mutationFn: (data: any) => assetsApi.move(Number(id), data.to_building, data.to_room, data.reason),
    onSuccess: () => {
      toast.success('Asset moved successfully');
      queryClient.invalidateQueries({ queryKey: ['asset', id] });
    }
  });

  const flagDisposalMutation = useMutation({
    mutationFn: () => assetsApi.flagDisposal(Number(id)),
    onSuccess: () => {
      toast.success('Asset flagged for disposal');
      queryClient.invalidateQueries({ queryKey: ['asset', id] });
    }
  });

  const confirmDisposalMutation = useMutation({
    mutationFn: () => assetsApi.confirmDisposal(Number(id)),
    onSuccess: () => {
      toast.success('Asset disposed permanently');
      queryClient.invalidateQueries({ queryKey: ['asset', id] });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: () => assetsApi.delete(Number(id)),
    onSuccess: () => {
      toast.success('Asset deleted successfully');
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      navigate('/assets');
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Failed to delete asset');
    }
  });

  const handleMoveSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const data = Object.fromEntries(formData.entries());
    moveMutation.mutate(data);
    (e.target as HTMLFormElement).reset();
  };

  if (isLoading) return <div>Loading...</div>;
  if (!asset) return <div>Asset not found</div>;

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="page-header">{asset.name}</h1>
            <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
              asset.disposal_status === 'active' ? 'bg-green-100 text-green-700' :
              asset.disposal_status === 'pending_disposal' ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {asset.disposal_status.replace('_', ' ')}
            </span>
            <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
              asset.condition === 'working' ? 'bg-blue-100 text-blue-700' :
              asset.condition === 'damaged' ? 'bg-red-100 text-red-700' :
              'bg-yellow-100 text-yellow-700'
            }`}>
              {asset.condition}
            </span>
          </div>
          <p className="page-subtitle font-mono text-slate-700 font-semibold">
            {asset.asset_tag} {asset.legacy_asset_tag ? `· Prev: ${asset.legacy_asset_tag}` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="card p-6 grid grid-cols-2 md:grid-cols-3 gap-y-6 gap-x-4">
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Shield size={16} /> Category</p>
              <p className="font-semibold capitalize">{asset.category?.replace('_', ' ')}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Shield size={16} /> Existing/Legacy Tag</p>
              <p className="font-semibold font-mono">{asset.legacy_asset_tag || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Shield size={16} /> Funding Source</p>
              <p className="font-semibold capitalize">{asset.fund_source?.replace('_', ' ') || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><UserIcon size={16} /> Custodian</p>
              <p className="font-semibold">{asset.custodian || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><MapPin size={16} /> Location</p>
              <p className="font-semibold">{asset.building || 'N/A'} - {asset.room || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Calendar size={16} /> Purchase Date</p>
              <p className="font-semibold">{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><IndianRupee size={16} /> Unit Cost</p>
              <p className="font-semibold">₹{(asset.unit_cost || 0).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-1 flex items-center gap-1"><Shield size={16} /> Serial Number</p>
              <p className="font-semibold font-mono">{asset.serial_number || 'N/A'}</p>
            </div>
          </div>

          <div className="card p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2"><Activity size={18} /> Audit Log</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-white sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Performed By</th>
                    <th className="px-4 py-3">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {asset.logs?.map((log: any) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{new Date(log.performed_at).toLocaleString()}</td>
                      <td className="px-4 py-3 font-medium text-slate-700 capitalize">{log.action.replace('_', ' ')}</td>
                      <td className="px-4 py-3">{log.performed_by_id}</td>
                      <td className="px-4 py-3 text-xs">
                        {log.old_value && <div className="text-slate-400">Old: {JSON.stringify(log.old_value)}</div>}
                        {log.new_value && <div className="text-slate-600">New: {JSON.stringify(log.new_value)}</div>}
                      </td>
                    </tr>
                  ))}
                  {(!asset.logs || asset.logs.length === 0) && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-slate-500 italic">No logs found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6 flex flex-col items-center border-2 border-dashed border-[#1a3a6b]/30 bg-blue-50/50">
            <h3 className="text-sm font-bold text-slate-700 mb-4 w-full text-left">Asset QR Code</h3>
            {asset.qr_code_url ? (
              <div className="bg-white p-2 rounded shadow-sm border border-slate-200 mb-4">
                <img src={asset.qr_code_url} alt="QR Code" className="w-48 h-48 object-contain" />
              </div>
            ) : (
              <div className="w-48 h-48 bg-slate-100 flex items-center justify-center text-slate-400 mb-4 rounded">No QR</div>
            )}
            <a href={asset.qr_code_url} download={`QR_${asset.asset_tag}.png`} className="btn-secondary w-full text-center">
              Download QR Label
            </a>
          </div>

          <div className="card p-6">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Actions</h3>
            
            {(isHod || isStores) && asset.disposal_status === 'active' && (
              <div className="mb-6 pb-6 border-b border-slate-200">
                <label className="block text-xs font-medium text-slate-700 mb-2">Update Condition</label>
                <div className="flex gap-2">
                  <select 
                    className="input-field flex-1"
                    value={asset.condition}
                    onChange={(e) => updateConditionMutation.mutate(e.target.value)}
                    disabled={updateConditionMutation.isPending}
                  >
                    <option value="working">Working/Good</option>
                    <option value="damaged">Damaged</option>
                    <option value="partial">Partial</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
            )}

            {isHod && asset.disposal_status === 'active' && (
              <div className="mb-6 pb-6 border-b border-slate-200">
                <label className="block text-xs font-medium text-slate-700 mb-2 flex items-center gap-1"><ArrowRightLeft size={14} /> Move Asset</label>
                <form onSubmit={handleMoveSubmit} className="space-y-3">
                  <input type="text" name="to_building" required placeholder="New Building" className="input-field w-full text-sm" />
                  <input type="text" name="to_room" required placeholder="New Room" className="input-field w-full text-sm" />
                  <input type="text" name="reason" placeholder="Reason (Optional)" className="input-field w-full text-sm" />
                  <button type="submit" disabled={moveMutation.isPending} className="btn-primary w-full py-1.5 text-sm">Move</button>
                </form>
              </div>
            )}

            {isHod && asset.disposal_status === 'active' && (
              <div>
                <button 
                  onClick={() => { if(confirm('Are you sure you want to flag this asset for disposal?')) flagDisposalMutation.mutate(); }}
                  disabled={flagDisposalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded font-medium text-sm border border-yellow-300 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 transition-colors"
                >
                  <Trash2 size={16} /> Flag for Disposal
                </button>
              </div>
            )}

            {(isAdmin || isStores) && asset.disposal_status === 'pending_disposal' && (
              <div>
                <button 
                  onClick={() => { if(confirm('Permanently mark as disposed? This cannot be undone.')) confirmDisposalMutation.mutate(); }}
                  disabled={confirmDisposalMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded font-medium text-sm border border-red-300 text-red-700 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <Trash2 size={16} /> Confirm Disposal
                </button>
              </div>
            )}
            
            {asset.disposal_status === 'disposed' && (
               <p className="text-center text-sm text-red-500 font-medium italic">Asset has been disposed.</p>
            )}

            {(isHod || isAdmin) && (
              <div className="pt-4 border-t border-slate-200 mt-4">
                <button 
                  onClick={() => { if(confirm('Are you sure you want to permanently delete this asset? This cannot be undone.')) deleteMutation.mutate(); }}
                  disabled={deleteMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded font-medium text-sm border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 transition-colors"
                >
                  <Trash2 size={16} /> Delete Asset
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
