import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { toast } from 'react-hot-toast';
import { ArrowLeft, CheckCircle, AlertTriangle, FileText, Package, Upload, Clock } from 'lucide-react';

export const DeliveryDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isHod = user?.role?.group_key === 'hod';
  const isStores = user?.role?.group_key === 'verifier_sp';
  const isApex = user?.role?.group_key === 'apex_approver';
  const isAdmin = user?.role?.group_key === 'admin';

  const { data: delivery, isLoading } = useQuery({
    queryKey: ['delivery', id],
    queryFn: () => inventoryApi.getDelivery(Number(id)).then(res => res.data),
    enabled: !!id,
  });

  const [expandedItem, setExpandedItem] = useState<number | null>(null);

  // Initiator Form State
  const [invoiceNo, setInvoiceNo] = useState('');
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [challanFile, setChallanFile] = useState<File | null>(null);

  const confirmMutation = useMutation({
    mutationFn: (formData: FormData) => inventoryApi.confirmDelivery(Number(id), formData),
    onSuccess: () => {
      toast.success('Delivery confirmed successfully');
      queryClient.invalidateQueries({ queryKey: ['delivery', id] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.detail || 'Error confirming delivery');
    }
  });

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!delivery) return <div className="p-6">Delivery not found</div>;

  const isInitiator = user && delivery?.purchase_request && delivery.purchase_request.initiator_id === user.id;

  const handleConfirmSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceNo) {
      toast.error('Invoice number is required');
      return;
    }
    if (!invoiceFile) {
      toast.error('Invoice PDF file is required');
      return;
    }
    if (!challanFile) {
      toast.error('Challan PDF file is required');
      return;
    }
    const formData = new FormData();
    formData.append('invoice_number', invoiceNo);
    formData.append('invoice_pdf', invoiceFile);
    formData.append('challan_pdf', challanFile);
    confirmMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600">
          <ArrowLeft size={24} />
        </button>
        <div>
          <h1 className="page-header flex items-center gap-3">
            Delivery Details
            <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
              delivery.status === 'verified' ? 'bg-green-100 text-green-700' :
              delivery.status === 'discrepancy' ? 'bg-red-100 text-red-700' :
              delivery.status === 'pending' ? 'bg-amber-100 text-amber-700' :
              'bg-blue-100 text-blue-700'
            }`}>
              {delivery.status.replace('_', ' ')}
            </span>
          </h1>
          <p className="page-subtitle">PO Ref: #{delivery.po_id}</p>
        </div>
      </div>

      {/* Awaiting Initiator Warning for HOD / Stores */}
      {delivery.status === 'pending' && !isInitiator && (
        <div className="card p-6 bg-amber-50 border border-amber-200 flex items-start gap-4">
          <div className="p-2 bg-amber-100 rounded-full text-amber-700">
            <Clock size={24} />
          </div>
          <div>
            <h3 className="text-md font-bold text-amber-800">Awaiting Initiator Confirmation</h3>
            <p className="text-sm text-amber-700 mt-1">
              This delivery is currently pending confirmation from the purchase request initiator (faculty/staff).
              Once the initiator uploads the invoice number, invoice PDF, and delivery challan PDF, you will be enabled to log your receipts and verify the items.
            </p>
          </div>
        </div>
      )}

      {/* Initiator Confirmation Form */}
      {delivery.status === 'pending' && isInitiator && (
        <div className="card p-6 bg-white border border-slate-200">
          <h3 className="text-lg font-bold text-[#1a3a6b] mb-4 border-b border-slate-200 pb-2 flex items-center gap-2">
            <Upload size={20} />
            Confirm Delivery Receipt
          </h3>
          <p className="text-sm text-slate-600 mb-6">
            As the initiator of the purchase request, please confirm that the items have been received. Upload the vendor's invoice PDF and the delivery challan PDF, and provide the invoice number to proceed.
          </p>
          <form onSubmit={handleConfirmSubmit} className="space-y-4 max-w-xl">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice Number <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={invoiceNo}
                onChange={e => setInvoiceNo(e.target.value)}
                placeholder="Enter invoice number (e.g. INV/2026/042)"
                className="input-field w-full text-sm py-2 px-3"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Invoice PDF <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={e => setInvoiceFile(e.target.files?.[0] || null)}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Delivery Challan PDF <span className="text-red-500">*</span></label>
                <input
                  type="file"
                  accept="application/pdf"
                  required
                  onChange={e => setChallanFile(e.target.files?.[0] || null)}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
              </div>
            </div>
            <div className="pt-2">
              <button
                type="submit"
                disabled={confirmMutation.isPending}
                className="btn-primary py-2 px-6 text-sm font-bold flex items-center gap-2"
              >
                {confirmMutation.isPending ? 'Confirming...' : 'Confirm Delivery'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card p-6 col-span-2">
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Delivery Information</h3>
          <div className="grid grid-cols-2 gap-y-4">
            <div>
              <p className="text-sm text-slate-500">Challan Number</p>
              <p className="font-semibold">{delivery.challan_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Invoice Number</p>
              <p className="font-semibold">{delivery.invoice_number || 'N/A'}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Received Date</p>
              <p className="font-semibold">{delivery.received_date ? new Date(delivery.received_date).toLocaleDateString() : 'N/A'}</p>
            </div>
          </div>

          {/* Uploaded PDF Download links */}
          {(delivery.invoice_pdf_path || delivery.challan_pdf_path) && (
            <div className="border-t border-slate-200 pt-4 mt-6">
              <p className="text-sm font-bold text-slate-700 mb-3">Uploaded Documents</p>
              <div className="flex flex-wrap gap-4">
                {delivery.invoice_pdf_path && (
                  <a
                    href={`/storage/${delivery.invoice_pdf_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded text-blue-700 text-sm font-medium transition-colors"
                  >
                    <FileText size={16} />
                    <span>Invoice PDF</span>
                  </a>
                )}
                {delivery.challan_pdf_path && (
                  <a
                    href={`/storage/${delivery.challan_pdf_path}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 rounded text-blue-700 text-sm font-medium transition-colors"
                  >
                    <FileText size={16} />
                    <span>Delivery Challan PDF</span>
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="card p-6">
          <h3 className="text-lg font-bold text-slate-800 mb-4 border-b border-slate-200 pb-2">Payment Status</h3>
          {delivery.payments?.length > 0 ? (
            <div className="space-y-3">
              {delivery.payments.map((p: any) => (
                <div key={p.id} className="flex justify-between items-center p-3 bg-slate-50 rounded border border-slate-100">
                  <div>
                    <p className="text-sm font-semibold">₹{p.amount.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">{p.invoice_number}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded font-bold uppercase tracking-wider ${
                    p.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No payment records found.</p>
          )}
        </div>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="p-6 border-b border-slate-200 bg-slate-50">
          <h3 className="text-lg font-bold text-slate-800">Received Items</h3>
        </div>
        <div className="divide-y divide-slate-200">
          {delivery.items.map((item: any) => (
            <ItemRow key={item.id} item={item} deliveryId={delivery.id} deliveryStatus={delivery.status} isExpanded={expandedItem === item.id} onToggle={() => setExpandedItem(expandedItem === item.id ? null : item.id)} isHod={isHod} isStores={isStores} isApex={isApex} isAdmin={isAdmin} />
          ))}
        </div>
      </div>
    </div>
  );
};

const ItemRow = ({ item, deliveryId, deliveryStatus, isExpanded, onToggle, isHod, isStores, isApex, isAdmin }: any) => {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    quantity: item.challan_quantity,
    condition: 'working',
    building: '',
    room: '',
    custodian_name: '',
    serial_numbers: '',
    remarks: ''
  });

  const isPending = deliveryStatus === 'pending';

  const logDeptMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.logDeptReceipt(deliveryId, item.id, data),
    onSuccess: () => {
      toast.success('Department receipt logged');
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId.toString()] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error logging receipt')
  });

  const logStoresMutation = useMutation({
    mutationFn: (data: any) => inventoryApi.logStoresReceipt(deliveryId, item.id, data),
    onSuccess: () => {
      toast.success('Stores receipt logged');
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId.toString()] });
    },
    onError: (err: any) => toast.error(err.response?.data?.detail || 'Error logging receipt')
  });

  const approveStoresMutation = useMutation({
    mutationFn: () => inventoryApi.approveStoresLog(deliveryId, item.id),
    onSuccess: () => {
      toast.success('Stores log approved');
      queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId.toString()] });
    }
  });

  const handleSubmit = (e: React.FormEvent, type: 'dept' | 'stores') => {
    e.preventDefault();
    const data = {
      ...formData,
      serial_numbers: formData.serial_numbers ? formData.serial_numbers.split(',').map(s => s.trim()) : []
    };
    if (type === 'dept') logDeptMutation.mutate(data);
    else logStoresMutation.mutate(data);
  };

  const getStatusIcon = () => {
    if (item.discrepancy) return <AlertTriangle className="text-red-500" size={20} />;
    if (item.stores_log?.is_approved) return <CheckCircle className="text-green-500" size={20} />;
    if (item.dept_log || item.stores_log) return <FileText className="text-blue-500" size={20} />;
    return <Package className="text-slate-400" size={20} />;
  };

  return (
    <div className="bg-white">
      <div className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors" onClick={onToggle}>
        <div className="flex items-center gap-4">
          {getStatusIcon()}
          <div>
            <p className="font-semibold text-slate-800">{item.name}</p>
            <p className="text-xs text-slate-500">{item.category} • Challan Qty: {item.challan_quantity}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">₹{item.unit_price.toLocaleString()}</span>
          <button className="text-blue-600 hover:underline text-sm font-medium">{isExpanded ? 'Hide Details' : 'Verify'}</button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-6 bg-slate-50 border-t border-slate-200 grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Department Log Section */}
          <div>
            <h4 className="font-bold text-slate-700 mb-3 flex items-center gap-2">
              Department Verification
              {item.dept_log && <CheckCircle size={16} className="text-green-500" />}
            </h4>
            
            {item.dept_log ? (
              <div className="bg-white p-4 rounded border border-slate-200 space-y-2 text-sm">
                <p><span className="text-slate-500">Qty Received:</span> {item.dept_log.quantity}</p>
                <p><span className="text-slate-500">Condition:</span> <span className="capitalize">{item.dept_log.condition}</span></p>
                <p><span className="text-slate-500">Location:</span> {item.dept_log.building} - {item.dept_log.room}</p>
                <p><span className="text-slate-500">Custodian:</span> {item.dept_log.custodian_name}</p>
                {item.dept_log.serial_numbers?.length > 0 && (
                  <p><span className="text-slate-500">Serial Numbers:</span> {item.dept_log.serial_numbers.join(', ')}</p>
                )}
                {item.dept_log.remarks && <p><span className="text-slate-500">Remarks:</span> {item.dept_log.remarks}</p>}
                <p className="text-xs text-green-600 font-medium mt-2 pt-2 border-t border-slate-100">Immutable record submitted.</p>
              </div>
            ) : isPending ? (
              <div className="bg-white p-4 rounded border border-slate-200 text-sm text-slate-500 italic">
                Awaiting initiator confirmation.
              </div>
            ) : isHod ? (
              <form onSubmit={(e) => handleSubmit(e, 'dept')} className="space-y-3 bg-white p-4 rounded border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Qty Received</label>
                    <input type="number" min="0" max={item.challan_quantity} required value={formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} className="input-field w-full text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Condition</label>
                    <select required value={formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="input-field w-full text-sm py-1.5">
                      <option value="working">Working/Good</option>
                      <option value="damaged">Damaged</option>
                      <option value="partial">Partial</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Building</label>
                    <input type="text" value={formData.building} onChange={e => setFormData({...formData, building: e.target.value})} className="input-field w-full text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Room</label>
                    <input type="text" value={formData.room} onChange={e => setFormData({...formData, room: e.target.value})} className="input-field w-full text-sm py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Custodian Name</label>
                  <input type="text" value={formData.custodian_name} onChange={e => setFormData({...formData, custodian_name: e.target.value})} className="input-field w-full text-sm py-1.5" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Serial Numbers (comma separated)</label>
                  <input type="text" value={formData.serial_numbers} onChange={e => setFormData({...formData, serial_numbers: e.target.value})} placeholder="SN1, SN2, SN3" className="input-field w-full text-sm py-1.5" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Remarks</label>
                  <input type="text" value={formData.remarks} onChange={e => setFormData({...formData, remarks: e.target.value})} className="input-field w-full text-sm py-1.5" />
                </div>
                <button type="submit" disabled={logDeptMutation.isPending} className="btn-primary w-full py-1.5 text-sm mt-2">
                  {logDeptMutation.isPending ? 'Saving...' : 'Submit Dept Log'}
                </button>
              </form>
            ) : (
              <div className="bg-white p-4 rounded border border-slate-200 text-sm text-slate-500 italic">
                Awaiting department verification by HOD.
              </div>
            )}
          </div>

          {/* Stores Log Section */}
          <div>
            <h4 className="font-bold text-slate-700 mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                Stores Verification
                {item.stores_log?.is_approved && <CheckCircle size={16} className="text-green-500" />}
              </span>
              {item.discrepancy && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Discrepancy</span>}
            </h4>

            {item.stores_log && item.stores_log.is_approved ? (
               <div className="bg-white p-4 rounded border border-slate-200 space-y-2 text-sm border-l-4 border-l-green-500">
                 <p><span className="text-slate-500">Qty Verified:</span> {item.stores_log.quantity}</p>
                 <p><span className="text-slate-500">Condition:</span> <span className="capitalize">{item.stores_log.condition}</span></p>
                 <p className="text-xs text-green-600 font-medium mt-2 pt-2 border-t border-slate-100">Approved by Apex Authority.</p>
               </div>
            ) : isPending ? (
              <div className="bg-white p-4 rounded border border-slate-200 text-sm text-slate-500 italic">
                Awaiting initiator confirmation.
              </div>
            ) : isStores ? (
              <form onSubmit={(e) => handleSubmit(e, 'stores')} className="space-y-3 bg-white p-4 rounded border border-slate-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Qty Verified</label>
                    <input type="number" min="0" max={item.challan_quantity} required defaultValue={item.stores_log?.quantity || formData.quantity} onChange={e => setFormData({...formData, quantity: Number(e.target.value)})} className="input-field w-full text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Condition</label>
                    <select required defaultValue={item.stores_log?.condition || formData.condition} onChange={e => setFormData({...formData, condition: e.target.value})} className="input-field w-full text-sm py-1.5">
                      <option value="working">Working/Good</option>
                      <option value="damaged">Damaged</option>
                      <option value="partial">Partial</option>
                    </select>
                  </div>
                </div>
                <div className="text-xs text-slate-500 mt-2 mb-2 p-2 bg-blue-50 rounded">
                  Note: You can override building/room/custodian/serial numbers if they differ from dept log, or leave blank to accept dept log values automatically upon submission.
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Building</label>
                    <input type="text" defaultValue={item.stores_log?.building || ''} onChange={e => setFormData({...formData, building: e.target.value})} className="input-field w-full text-sm py-1.5" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Room</label>
                    <input type="text" defaultValue={item.stores_log?.room || ''} onChange={e => setFormData({...formData, room: e.target.value})} className="input-field w-full text-sm py-1.5" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Custodian Name</label>
                  <input type="text" defaultValue={item.stores_log?.custodian_name || ''} onChange={e => setFormData({...formData, custodian_name: e.target.value})} className="input-field w-full text-sm py-1.5" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Serial Numbers</label>
                  <input type="text" defaultValue={item.stores_log?.serial_numbers?.join(', ') || ''} onChange={e => setFormData({...formData, serial_numbers: e.target.value})} className="input-field w-full text-sm py-1.5" />
                </div>
                
                <button type="submit" disabled={logStoresMutation.isPending} className="btn-primary w-full py-1.5 text-sm mt-2">
                  {logStoresMutation.isPending ? 'Saving...' : (item.stores_log ? 'Update Stores Log' : 'Submit Stores Log')}
                </button>
              </form>
            ) : item.stores_log ? (
              <div className="bg-white p-4 rounded border border-slate-200 space-y-2 text-sm border-l-4 border-l-blue-500">
                <p><span className="text-slate-500">Qty Verified:</span> {item.stores_log.quantity}</p>
                <p><span className="text-slate-500">Condition:</span> <span className="capitalize">{item.stores_log.condition}</span></p>
                
                {isApex && (
                  <div className="mt-4 pt-4 border-t border-slate-100">
                    <button onClick={() => approveStoresMutation.mutate()} disabled={approveStoresMutation.isPending} className="btn-primary w-full py-1.5 text-sm">
                      {approveStoresMutation.isPending ? 'Approving...' : 'Approve Stores Verification'}
                    </button>
                  </div>
                )}
                {!isApex && <p className="text-xs text-blue-600 font-medium mt-2 pt-2 border-t border-slate-100">Awaiting Apex Approval.</p>}
              </div>
            ) : (
              <div className="bg-white p-4 rounded border border-slate-200 text-sm text-slate-500 italic">
                Awaiting stores verification.
              </div>
            )}

            {item.discrepancy && (
               <div className="mt-4 bg-red-50 p-4 rounded border border-red-200 space-y-2 text-sm">
                 <p className="font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Discrepancy Found</p>
                 <div className="grid grid-cols-3 gap-2 text-center mt-2">
                   <div className="bg-white p-2 rounded border border-red-100">
                     <p className="text-xs text-slate-500">Challan</p>
                     <p className="font-bold">{item.discrepancy.challan_qty}</p>
                   </div>
                   <div className="bg-white p-2 rounded border border-red-100">
                     <p className="text-xs text-slate-500">Dept</p>
                     <p className="font-bold">{item.discrepancy.dept_qty}</p>
                   </div>
                   <div className="bg-white p-2 rounded border border-red-100">
                     <p className="text-xs text-slate-500">Stores</p>
                     <p className="font-bold">{item.discrepancy.stores_qty}</p>
                   </div>
                 </div>
               </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
