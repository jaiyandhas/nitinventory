import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatCurrency } from '../utils/format';
import { Plus, Search, Filter, ArrowUpDown } from 'lucide-react';
import { aaApi } from '../services/api';
import { useAuth } from '../context/AuthContext';

export const AdministrativeApprovalsListPage: React.FC = () => {
  const { isRole } = useAuth();
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'approved' | 'returned' | 'rejected'>('all');
  const [statusFilter, setStatusFilter] = useState('');
  const [fundFilter, setFundFilter] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: approvals = [], isLoading, refetch } = useQuery({
    queryKey: ['administrative-approvals', search, statusFilter, fundFilter, sortBy, sortOrder],
    queryFn: () =>
      aaApi
        .list({
          search: search || undefined,
          status: statusFilter || undefined,
          source_of_fund: fundFilter || undefined,
          sort_by: sortBy,
          sort_order: sortOrder,
        })
        .then((r) => r.data),
    refetchOnMount: 'always',
  });

  const filteredApprovals = React.useMemo(() => {
    return approvals.filter((aa: any) => {
      const status = aa.status || '';
      if (activeTab === 'approved') {
        return status === 'Administrative Approval Granted';
      }
      if (activeTab === 'rejected') {
        return status === 'Rejected';
      }
      if (activeTab === 'returned') {
        return status.toLowerCase().includes('returned');
      }
      if (activeTab === 'pending') {
        return (
          status !== 'Administrative Approval Granted' &&
          status !== 'Rejected' &&
          !status.toLowerCase().includes('returned')
        );
      }
      return true;
    });
  }, [approvals, activeTab]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Administrative Approval Granted':
        return 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold';
      case 'Rejected':
        return 'bg-rose-50 border border-rose-200 text-rose-800 font-bold';
      case 'Returned to PI':
        return 'bg-amber-50 border border-amber-200 text-amber-800 font-bold';
      case 'Submitted to HOD':
        return 'bg-blue-50 border border-blue-200 text-blue-800 font-semibold';
      case 'Pending with ADPD':
        return 'bg-indigo-50 border border-indigo-200 text-indigo-800 font-semibold';
      case 'Pending with Director':
        return 'bg-violet-50 border border-violet-200 text-violet-800 font-semibold';
      default:
        return 'bg-slate-50 border border-slate-200 text-slate-800';
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-header text-2xl font-bold text-slate-800">Administrative Approvals</h1>
          <p className="page-subtitle text-slate-500">
            Manage and track administrative approvals before proceeding to the Purchase Indent stage.
          </p>
        </div>
        {isRole('faculty') && (
          <Link
            to="/administrative-approvals/create"
            className="btn-primary flex items-center justify-center gap-2 py-2.5 px-4 bg-[#1a3a6b] hover:bg-[#1a3a6b]/90 text-white font-semibold text-sm rounded shadow transition-all shrink-0"
          >
            <Plus size={16} /> New Admin Approval Request
          </Link>
        )}
      </div>

      {/* Filters and Search Bar */}
      <div className="card p-4 bg-white shadow rounded-lg border border-slate-200 flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:w-80">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
            <Search size={18} />
          </span>
          <input
            type="text"
            placeholder="Search by PI, Item, Fund..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] focus:border-[#1a3a6b]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 uppercase">
            <Filter size={14} /> Filter:
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-slate-300 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
          >
            <option value="">All Statuses</option>
            <option value="Submitted to HOD">Submitted to HOD</option>
            <option value="Pending with ADPD">Pending with ADPD</option>
            <option value="Pending with Director">Pending with Director</option>
            <option value="Returned to PI">Returned to PI</option>
            <option value="Administrative Approval Granted">Administrative Approval Granted</option>
            <option value="Rejected">Rejected</option>
          </select>

          <select
            value={fundFilter}
            onChange={(e) => setFundFilter(e.target.value)}
            className="border border-slate-300 rounded-lg py-1.5 px-3 text-sm focus:outline-none focus:ring-1 focus:ring-[#1a3a6b] bg-white"
          >
            <option value="">All Funds</option>
            <option value="OH-35">OH-35</option>
            <option value="OH-31">OH-31</option>
            <option value="SW">Student Welfare (SW)</option>
            <option value="SEED">SEED Grant</option>
            <option value="R&C">R&C (Project)</option>
            <option value="Others">Others</option>
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-200 gap-0 px-1">
        {[
          { key: 'all', label: 'All Requests', count: approvals.length, color: 'border-[#1a3a6b] text-[#1a3a6b]', bg: 'bg-blue-100 text-[#1a3a6b]' },
          { 
            key: 'pending', 
            label: 'Pending', 
            count: approvals.filter((aa: any) => aa.status !== 'Administrative Approval Granted' && aa.status !== 'Rejected' && !aa.status.toLowerCase().includes('returned')).length,
            color: 'border-blue-500 text-blue-700',
            bg: 'bg-blue-50 text-blue-700' 
          },
          { 
            key: 'approved', 
            label: 'Approved', 
            count: approvals.filter((aa: any) => aa.status === 'Administrative Approval Granted').length,
            color: 'border-emerald-500 text-emerald-700',
            bg: 'bg-emerald-50 text-emerald-700' 
          },
          { 
            key: 'returned', 
            label: 'Returned', 
            count: approvals.filter((aa: any) => aa.status.toLowerCase().includes('returned')).length,
            color: 'border-amber-500 text-amber-700',
            bg: 'bg-amber-50 text-amber-800' 
          },
          { 
            key: 'rejected', 
            label: 'Rejected', 
            count: approvals.filter((aa: any) => aa.status === 'Rejected').length,
            color: 'border-rose-500 text-rose-700',
            bg: 'bg-rose-50 text-rose-800' 
          },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as any)}
            className={`pb-3 px-4 text-sm font-semibold tracking-wide border-b-2 transition-all relative ${
              activeTab === tab.key
                ? tab.color
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full font-medium ${
              activeTab === tab.key ? tab.bg : 'bg-slate-100 text-slate-600'
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Dashboard Table */}
      {isLoading ? (
        <div className="card p-8 text-center text-slate-500 font-medium">Loading approval requests...</div>
      ) : (
        <div className="card overflow-x-auto bg-white shadow border border-slate-200 rounded-lg">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 border-b border-slate-200 bg-slate-50 uppercase tracking-wider">
                <th className="text-left px-5 py-4 font-bold">Request / AA No</th>
                <th className="text-left px-5 py-4 font-bold">File No</th>
                <th
                  className="text-left px-5 py-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('pi_name')}
                >
                  <div className="flex items-center gap-1">
                    PI Name <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="text-left px-5 py-4 font-bold">Department</th>
                <th className="text-left px-5 py-4 font-bold">Source of Fund</th>
                <th className="text-left px-5 py-4 font-bold">Item Name</th>
                <th
                  className="text-right px-5 py-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('total_cost')}
                >
                  <div className="flex items-center justify-end gap-1">
                    Total Cost <ArrowUpDown size={12} />
                  </div>
                </th>
                <th className="text-center px-5 py-4 font-bold">Status</th>
                <th className="text-left px-5 py-4 font-bold">Pending With</th>
                <th
                  className="text-left px-5 py-4 font-bold cursor-pointer hover:bg-slate-100 transition-colors"
                  onClick={() => handleSort('created_at')}
                >
                  <div className="flex items-center gap-1">
                    Submitted Date <ArrowUpDown size={12} />
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredApprovals.map((aa: any) => (
                <tr key={aa.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link to={`/administrative-approvals/${aa.id}`} className="text-[#1a3a6b] hover:underline font-bold">
                      {aa.aa_number !== '-' ? aa.aa_number : `REQ-${aa.id.toString().padStart(4, '0')}`}
                    </Link>
                  </td>
                  <td className="px-5 py-4 text-slate-700 font-mono text-xs">{aa.file_no || '—'}</td>
                  <td className="px-5 py-4 text-slate-700 font-semibold">{aa.pi_name}</td>
                  <td className="px-5 py-4 text-slate-600">{aa.department}</td>
                  <td className="px-5 py-4 text-slate-600">
                    <span className="font-semibold">{aa.source_of_fund}</span>
                    {aa.project_code !== '-' && <span className="text-xs text-slate-500 block">Code: {aa.project_code}</span>}
                  </td>
                  <td className="px-5 py-4 text-slate-700 font-medium max-w-xs truncate">{aa.item_name}</td>
                  <td className="px-5 py-4 text-right text-slate-800 font-bold">{formatCurrency(aa.total_cost)}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`px-2.5 py-1 rounded text-xs inline-block ${getStatusBadgeClass(aa.status)}`}>
                      {aa.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-slate-700 font-semibold">
                      {aa.pending_with === 'PI' ? 'PI (Initiator)' : aa.pending_with}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-500 font-medium">
                    {aa.submitted_date ? new Date(aa.submitted_date).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
              {filteredApprovals.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-10 text-slate-500 text-sm font-medium">
                    No Administrative Approval requests found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
