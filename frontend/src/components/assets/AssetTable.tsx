import React from 'react';
import { Link } from 'react-router-dom';
import { QrCode, IndianRupee } from 'lucide-react';
import { Asset } from '../../types';

interface AssetTableProps {
  filteredAssets: Asset[];
  conditionColors: Record<string, string>;
}

export const AssetTable: React.FC<AssetTableProps> = ({ filteredAssets, conditionColors }) => {
  return (
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
                <span className={`status-badge ${conditionColors[asset.condition] || ''}`}>
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
  );
};
