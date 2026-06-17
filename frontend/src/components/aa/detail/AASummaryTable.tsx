import React from 'react';
import { Download, Paperclip, ChevronRight } from 'lucide-react';

interface AASummaryTableProps {
  aa: any;
  formatCurrency: (n?: number) => string;
}

const numberToWordsINR = (num: number): string => {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  const numToWords = (n: number): string => {
    if (n < 20) return a[n];
    const digit = n % 10;
    return b[Math.floor(n / 10)] + (digit ? '-' + a[digit] : '');
  };

  const convert = (n: number): string => {
    if (n === 0) return 'zero';
    let str = '';
    const crore = Math.floor(n / 10000000);
    n %= 10000000;
    if (crore > 0) {
      str += numToWords(crore) + ' crore ';
    }
    const lakh = Math.floor(n / 100000);
    n %= 100000;
    if (lakh > 0) {
      str += numToWords(lakh) + ' lakh ';
    }
    const thousand = Math.floor(n / 1000);
    n %= 1000;
    if (thousand > 0) {
      str += numToWords(thousand) + ' thousand ';
    }
    const hundred = Math.floor(n / 100);
    n %= 100;
    if (hundred > 0) {
      str += numToWords(hundred) + ' hundred ';
    }
    if (n > 0) {
      if (str !== '') str += 'and ';
      str += numToWords(n) + ' ';
    }
    return str.trim();
  };

  const intPart = Math.floor(num);
  const decPart = Math.round((num - intPart) * 100);
  let result = convert(intPart) + ' rupees';
  if (decPart > 0) {
    result += ' and ' + convert(decPart) + ' paise';
  }
  return result.replace(/\s+/g, ' ').trim() + ' only';
};

export const AASummaryTable: React.FC<AASummaryTableProps> = ({ aa, formatCurrency }) => {
  const totalCost = aa.total_cost || aa.item_info?.total_cost || 0;
  const quantity = aa.quantity || aa.item_info?.quantity || 1;
  const unitCost = aa.item_info?.unit_cost || (quantity > 0 ? (totalCost - (aa.item_info?.gst_amount || 0)) / quantity : 0);
  const gstRate = aa.gst_rate || aa.item_info?.gst_rate || 0;
  const gstAmount = aa.item_info?.gst_amount || 0;
  const itemDescription = aa.item_description || aa.item_info?.item_description || '—';

  const handleViewFile = (url: string) => {
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    window.open(absoluteUrl, '_blank');
  };

  const handleDownloadFile = (url: string) => {
    const absoluteUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const link = document.createElement('a');
    link.href = absoluteUrl;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };  const cellStyle: React.CSSProperties = {
    border: '1px solid black',
    padding: '4px 8px',
    fontFamily: 'Times New Roman, Times, serif',
    fontSize: '12px',
    verticalAlign: 'top',
  };
  const labelStyle: React.CSSProperties = {
    ...cellStyle,
    fontWeight: 'bold',
    whiteSpace: 'nowrap',
    width: '22%',
  };
  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontFamily: 'Times New Roman, Times, serif',
    fontSize: '12px',
    color: 'black',
  };
  const thStyle: React.CSSProperties = {
    border: '1px solid black',
    padding: '4px 8px',
    fontFamily: 'Times New Roman, Times, serif',
    fontSize: '12px',
    fontWeight: 'bold',
    textAlign: 'center',
    backgroundColor: '#f0f0f0',
  };

  const piAction = aa.history?.find((h: any) => h.approver_role === 'PI');
  const hodAction = aa.history?.find((h: any) => h.approver_role.toLowerCase().includes('hod'));
  const subsequentActions = aa.history?.filter((h: any) => 
    !h.approver_role.toLowerCase().includes('hod') && 
    h.approver_role !== 'PI' && 
    !h.approver_role.toLowerCase().includes('nominee')
  ) || [];
  const iaAction = subsequentActions.find((h: any) => h.approver_role.toLowerCase().includes('ia') || h.approver_role.toLowerCase().includes('audit'));

  const hodName = hodAction?.approver_name || aa.hod?.name || '—';
  const piName = aa.budget_info?.pi_name || aa.pi_name || '—';
  const expert1Name = aa.nominees?.[0]?.nominee_name || '—';
  const expert2Name = aa.nominees?.[1]?.nominee_name || '—';
  const iaName = iaAction?.approver_name || '—';

  return (
    <div style={{ fontFamily: 'Times New Roman, Times, serif', color: 'black', backgroundColor: 'white', padding: '16px' }} className="space-y-6 text-left max-w-4xl mx-auto">
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '12px', borderBottom: '2px solid black', paddingBottom: '8px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          NATIONAL INSTITUTE OF TECHNOLOGY TIRUCHIRAPPALLI
        </div>
        <div style={{ fontWeight: 'bold', fontSize: '13px', marginTop: '4px', textTransform: 'uppercase' }}>
          ADMINISTRATIVE APPROVAL & PROCUREMENT REPORT
        </div>
      </div>

      {/* SECTION 1: Budget Information */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
          SECTION 1: Budget Information
        </div>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={labelStyle}>File No.</td>
              <td style={cellStyle}>{aa.budget_info?.file_no || '—'}</td>
              <td style={labelStyle}>Name of Department</td>
              <td style={cellStyle}>{aa.budget_info?.department || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Request Ref</td>
              <td style={cellStyle}>{aa.aa_number && aa.aa_number !== '-' ? aa.aa_number : `REQ-${aa.id}`}</td>
              <td style={labelStyle}>Source of Fund</td>
              <td style={cellStyle}>{aa.budget_info?.source_of_fund || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Designation</td>
              <td style={cellStyle}>{aa.pi_designation || '—'}</td>
              <td style={labelStyle}>Contact (Email)</td>
              <td style={cellStyle}>{aa.pi_email || aa.budget_info?.pi_email || aa.pi?.email || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Estimated Amount (Incl. GST)</td>
              <td style={{ ...cellStyle, fontWeight: 'bold' }}>{formatCurrency(totalCost)}</td>
              <td style={cellStyle} colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 2: Details of Required Items */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
          SECTION 2: a) Details of the Required Items
        </div>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '4%' }}>S.No.</th>
              <th style={{ ...thStyle, textAlign: 'left', width: '32%' }}>Description of the Item</th>
              <th style={{ ...thStyle, width: '6%' }}>Qty</th>
              <th style={{ ...thStyle, width: '14%' }}>Unit Cost (Rs.)</th>
              <th style={{ ...thStyle, width: '8%' }}>GST %</th>
              <th style={{ ...thStyle, width: '14%' }}>GST Amount (Rs.)</th>
              <th style={{ ...thStyle, width: '14%' }}>Total Cost (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ ...cellStyle, textAlign: 'center' }}>1</td>
              <td style={cellStyle}>{itemDescription}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{quantity}</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(unitCost)}</td>
              <td style={{ ...cellStyle, textAlign: 'center' }}>{gstRate}%</td>
              <td style={{ ...cellStyle, textAlign: 'right' }}>{formatCurrency(gstAmount)}</td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold' }}>{formatCurrency(totalCost)}</td>
            </tr>
            <tr>
              <td colSpan={6} style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                Grand Total (Incl. GST):
              </td>
              <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 'bold', backgroundColor: '#f0f0f0' }}>
                {formatCurrency(totalCost)}
              </td>
            </tr>
          </tbody>
        </table>
        {/* Amount in words */}
        <div style={{ marginTop: '6px', border: '1px solid black', padding: '6px 8px', fontSize: '11px', fontFamily: 'Times New Roman' }}>
          <strong>Amount in Words:</strong> <span style={{ textTransform: 'capitalize' }}>{numberToWordsINR(totalCost)}</span>
        </div>
      </div>

      {/* Justification & Procurement Mode */}
      <div style={{ marginBottom: '14px' }}>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '30%' }}>Purpose / Justification for Purchase</td>
              <td style={cellStyle}>{aa.justification || aa.procurement_info?.justification || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Mode of Procurement</td>
              <td style={cellStyle}>{aa.mode_of_procurement || aa.procurement_info?.mode_of_procurement || '—'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Attachments Section */}
      {((aa.attachment_path) || (aa.budget_info?.attachment_path)) && (
        <div style={{ border: '1px solid black', padding: '8px 12px', marginBottom: '14px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '6px', textDecoration: 'underline' }}>
            Uploaded Documents & Attachments:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '11px' }}>
            {aa.attachment_path && (
              <div style={{ border: '1px solid #ccc', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Supporting Document</span>
                <button onClick={() => handleViewFile(aa.attachment_url)} style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>View</button>
                <button onClick={() => handleDownloadFile(aa.attachment_url)} style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>Download</button>
              </div>
            )}
            {aa.budget_info?.attachment_path && (
              <div style={{ border: '1px solid #ccc', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>Budget Attachment</span>
                <button onClick={() => handleViewFile(aa.budget_info.attachment_url)} style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>View</button>
                <button onClick={() => handleDownloadFile(aa.budget_info.attachment_url)} style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}>Download</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Declaration Section */}
      <div style={{ marginBottom: '14px', border: '1px solid black', padding: '8px 12px' }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '6px', textDecoration: 'underline' }}>
          Declaration (Certified that):
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px', fontSize: '12px' }}>
          <input type="checkbox" defaultChecked readOnly style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>The eligibility criteria is not unduly restrictive.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px' }}>
          <input type="checkbox" defaultChecked readOnly style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>
            The demand for good is not divided into small quantities to make piecemeal purchases to avoid tendering
            or the necessity of obtaining the sanction of higher authorities required with references to the estimated
            value of the total demand.
          </span>
        </div>
      </div>

      {/* Committee Finalization (No signature, just names) */}
      <div style={{ marginBottom: '14px', fontSize: '12px' }}>
        <div style={{ fontWeight: 'bold', marginBottom: '6px' }}>
          The following committee may finalize the above purchase:
        </div>
        <div style={{ paddingLeft: '12px', lineHeight: '1.8' }}>
          <div><strong>HOD:</strong> {hodName}</div>
          <div><strong>Purchase indentor:</strong> {piName}</div>
          <div><strong>Technical expert 1 nominated by HOD:</strong> {expert1Name}</div>
          <div><strong>Technical expert 2:</strong> {expert2Name}</div>
          <div><strong>IA:</strong> {iaName}</div>
        </div>
      </div>
    </div>
  );
};

