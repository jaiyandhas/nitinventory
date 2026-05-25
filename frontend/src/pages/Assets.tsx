import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { assetsApi } from '../services/api';
import { Asset } from '../types';
import { Link, useParams } from 'react-router-dom';
import { Package, QrCode } from 'lucide-react';

const CONDITION_COLORS: Record<string, string> = {
  working: 'bg-green-100 text-green-800 border-green-300',
  damaged: 'bg-red-100 text-red-800 border-red-300',
  under_repair: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  obsolete: 'bg-slate-100 text-slate-800 border-slate-300',
};

export const AssetListPage: React.FC = () => {
  const { data: assets = [], isLoading } = useQuery<Asset[]>({
    queryKey: ['assets'],
    queryFn: () => assetsApi.list().then(r => r.data),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-header">Asset Directory</h1>
        <p className="page-subtitle">Centralized view of {assets.length} institutional assets</p>
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading assets...</div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-semibold w-12"></th>
                <th className="text-left px-5 py-3 font-semibold">Asset Tag</th>
                <th className="text-left px-5 py-3 font-semibold">Asset Name</th>
                <th className="text-left px-5 py-3 font-semibold">Location</th>
                <th className="text-left px-5 py-3 font-semibold">Custodian</th>
                <th className="text-left px-5 py-3 font-semibold">Condition</th>
                <th className="text-left px-5 py-3 font-semibold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {assets.map((asset: Asset) => (
                <tr key={asset.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-3">
                    <div className="w-8 h-8 rounded bg-blue-50 border border-blue-100 flex items-center justify-center">
                      <Package size={16} className="text-[#1a3a6b]" />
                    </div>
                  </td>
                  <td className="px-5 py-3 font-mono text-xs font-bold text-slate-600">{asset.asset_tag}</td>
                  <td className="px-5 py-3 font-bold text-[#1a3a6b]">{asset.name}</td>
                  <td className="px-5 py-3 text-slate-600">{asset.building} · {asset.room}</td>
                  <td className="px-5 py-3 text-slate-600">{asset.custodian || '—'}</td>
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
              {assets.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-slate-500 text-sm font-medium">No assets registered yet.</td></tr>
              )}
            </tbody>
          </table>
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
          IRIS Asset Registry
        </div>
      </div>
    </div>
  );
};

