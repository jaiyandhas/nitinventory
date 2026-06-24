import React from 'react';

interface AASummaryTableProps {
  aa: any;
  formatCurrency: (n?: number) => string;
}

const numberToWordsINR = (num: number): string => {
  const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
  const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  const numToWords = (n: number): string => {
    if (n < 20) return a[n];
    const d = n % 10;
    return b[Math.floor(n / 10)] + (d ? '-' + a[d] : '');
  };
  const convert = (n: number): string => {
    if (n === 0) return 'zero';
    let s = '';
    const cr = Math.floor(n / 10000000); n %= 10000000;
    if (cr > 0) s += numToWords(cr) + ' crore ';
    const lk = Math.floor(n / 100000); n %= 100000;
    if (lk > 0) s += numToWords(lk) + ' lakh ';
    const th = Math.floor(n / 1000); n %= 1000;
    if (th > 0) s += numToWords(th) + ' thousand ';
    const hu = Math.floor(n / 100); n %= 100;
    if (hu > 0) s += numToWords(hu) + ' hundred ';
    if (n > 0) { if (s) s += 'and '; s += numToWords(n) + ' '; }
    return s.trim();
  };
  const intPart = Math.floor(num);
  const dec = Math.round((num - intPart) * 100);
  let result = convert(intPart) + ' rupees';
  if (dec > 0) result += ' and ' + convert(dec) + ' paise';
  return result.replace(/\s+/g, ' ').trim() + ' only';
};

const DocLink: React.FC<{ label: string; url: string | null | undefined }> = ({ label, url }) => {
  if (!url) return null;
  const abs = url.startsWith('http') ? url : `${window.location.origin}${url}`;
  return (
    <div style={{ border: '1px solid #ccc', borderRadius: '3px', padding: '5px 10px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', background: '#fafafa' }}>
      <span style={{ fontWeight: 'bold' }}>📄 {label}</span>
      <button
        onClick={() => window.open(abs, '_blank')}
        style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0, color: '#1a3a6b', fontWeight: 'bold' }}
      >
        View
      </button>
      <button
        onClick={() => { const a = document.createElement('a'); a.href = abs; a.setAttribute('download', ''); document.body.appendChild(a); a.click(); document.body.removeChild(a); }}
        style={{ textDecoration: 'underline', cursor: 'pointer', border: 'none', background: 'none', padding: 0, color: '#555' }}
      >
        Download
      </button>
    </div>
  );
};

export const AASummaryTable: React.FC<AASummaryTableProps> = ({ aa, formatCurrency }) => {
  const totalCost = aa.total_cost || aa.item_info?.total_cost || 0;
  const quantity = aa.quantity || aa.item_info?.quantity || 1;
  const gstRate = aa.gst_rate ?? aa.item_info?.gst_rate ?? 0;
  const gstAmount = aa.gst_amount || aa.item_info?.gst_amount || 0;
  const unitCost = aa.item_info?.unit_cost || (quantity > 0 ? (totalCost - gstAmount) / quantity : 0);
  const itemDescription = aa.item_description || aa.item_info?.item_description || '—';

  const modeOfProcurement = aa.mode_of_procurement || aa.procurement_info?.mode_of_procurement || '—';
  const subMethod = aa.sub_procurement_method || aa.procurement_info?.sub_procurement_method;
  const justification = aa.justification || aa.procurement_info?.justification || '—';

  // Compliance fields
  const itemCategory = aa.item_category || '—';
  const stockAvailability = aa.stock_availability || '—';
  const presentStock = aa.present_stock;
  const prevFileNo = aa.prev_file_no;
  const justificationProcurement = aa.justification_procurement;

  // Committee names
  const hodName = aa.budget_info?.hod_name || aa.history?.find((h: any) => h.approver_role.toLowerCase().includes('hod'))?.approver_name || '—';
  const piName = aa.budget_info?.pi_name || '—';
  const expert1Name = aa.nominees?.[0]?.nominee_name || '—';
  const expert2Name = aa.nominees?.[1]?.nominee_name || '—';
  const directorNomineeName = aa.budget_info?.director_faculty_name || '—';

  // Committee composition thresholds
  const L = 100000;
  const show1Expert = totalCost > 2 * L;
  const show2Expert = totalCost > 10 * L;
  const showDirectorNominee = totalCost > 30 * L;
  const showArDr = totalCost > 2 * L;
  const showIA = totalCost > 10 * L;

  const cellStyle: React.CSSProperties = {
    border: '1px solid black', padding: '4px 8px',
    fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', verticalAlign: 'top',
  };
  const labelStyle: React.CSSProperties = {
    ...cellStyle, fontWeight: 'bold', whiteSpace: 'nowrap', width: '22%',
  };
  const tableStyle: React.CSSProperties = {
    width: '100%', borderCollapse: 'collapse',
    fontFamily: 'Times New Roman, Times, serif', fontSize: '12px', color: 'black',
  };
  const thStyle: React.CSSProperties = {
    border: '1px solid black', padding: '4px 8px',
    fontFamily: 'Times New Roman, Times, serif', fontSize: '12px',
    fontWeight: 'bold', textAlign: 'center', backgroundColor: '#f0f0f0',
  };
  const sectionHead = (title: string) => (
    <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
      {title}
    </div>
  );

  return (
    <div style={{ fontFamily: 'Times New Roman, Times, serif', color: 'black', backgroundColor: 'white', padding: '16px' }} className="space-y-5 text-left max-w-4xl mx-auto">

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
      <div>
        {sectionHead('Section 1 – Budget Information')}
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
              <td style={labelStyle}>PI / Indentor</td>
              <td style={cellStyle}>{piName}</td>
              <td style={labelStyle}>Designation</td>
              <td style={cellStyle}>{aa.pi_designation || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Project Code</td>
              <td style={cellStyle}>{aa.budget_info?.project_code || '—'}</td>
              <td style={labelStyle}>Financial Year</td>
              <td style={cellStyle}>{aa.budget_info?.financial_year || '—'}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Estimated Amount (Incl. GST)</td>
              <td style={{ ...cellStyle, fontWeight: 'bold' }} colSpan={3}>{formatCurrency(totalCost)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 2a: Item Details */}
      <div>
        {sectionHead('Section 2a – Details of the Required Items')}
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: '4%' }}>S.No.</th>
              <th style={{ ...thStyle, textAlign: 'left', width: '34%' }}>Description of the Item</th>
              <th style={{ ...thStyle, width: '6%' }}>Qty</th>
              <th style={{ ...thStyle, width: '14%' }}>Unit Cost (Rs.)</th>
              <th style={{ ...thStyle, width: '8%' }}>GST %</th>
              <th style={{ ...thStyle, width: '13%' }}>GST Amount (Rs.)</th>
              <th style={{ ...thStyle, width: '13%' }}>Total Cost (Rs.)</th>
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
        <div style={{ marginTop: '6px', border: '1px solid black', padding: '6px 8px', fontSize: '11px' }}>
          <strong>Amount in Words:</strong>{' '}
          <span style={{ textTransform: 'capitalize' }}>{totalCost > 0 ? numberToWordsINR(totalCost) : '—'}</span>
        </div>
      </div>

      {/* SECTION 2b: Compliance Information */}
      <div>
        {sectionHead('Section 2b – Compliance Information')}
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '25%' }}>Category of Item</td>
              <td style={cellStyle}>{itemCategory}</td>
              <td style={{ ...labelStyle, width: '25%' }}>Stock Availability</td>
              <td style={cellStyle}>{stockAvailability}</td>
            </tr>
            {stockAvailability === 'Yes' && (
              <>
                <tr>
                  <td style={labelStyle}>Present Stock Quantity</td>
                  <td style={cellStyle}>{presentStock || '—'}</td>
                  <td style={labelStyle}>Previous File No.</td>
                  <td style={cellStyle}>{prevFileNo || '—'}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Justification for Present Procurement</td>
                  <td style={cellStyle} colSpan={3}>{justificationProcurement || '—'}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>

      {/* SECTION 3: Procurement Information */}
      <div>
        {sectionHead('Section 3 – Procurement Information')}
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '28%' }}>Mode of Procurement</td>
              <td style={cellStyle}>
                {modeOfProcurement}
                {subMethod && (() => {
                  const label = subMethod === 'gem' ? 'Via GeM Portal' : subMethod === 'outside_gem' ? 'Outside GeM' : subMethod === 'cppp' ? 'Via CPPP' : subMethod;
                  return (
                    <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 'bold', background: subMethod === 'gem' ? '#dbeafe' : subMethod === 'cppp' ? '#e0e7ff' : '#fef3c7', color: subMethod === 'gem' ? '#1d4ed8' : subMethod === 'cppp' ? '#4338ca' : '#92400e', padding: '1px 6px', borderRadius: '3px', border: `1px solid ${subMethod === 'gem' ? '#bfdbfe' : subMethod === 'cppp' ? '#c7d2fe' : '#fde68a'}` }}>
                      {label}
                    </span>
                  );
                })()}
              </td>
            </tr>
            <tr>
              <td style={labelStyle}>Justification for Purchase</td>
              <td style={cellStyle}>{justification}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* SECTION 4: Uploaded Documents */}
      <div>
        {sectionHead('Section 4 – Compliance Documents')}
        {(() => {
          const docs = [
            { label: 'Basis of Estimation', url: aa.basis_of_estimation_url },
            { label: 'GeM Non-Availability Report', url: aa.gem_non_availability_url },
            { label: 'Competent Authority / CPPP NIT Document', url: aa.authority_approval_url },
            { label: 'PAC Certificate – Department', url: aa.pac_dept_cert_url },
            { label: 'PAC Certificate – Vendor', url: aa.pac_vendor_cert_url },
            { label: 'Other Supporting Attachment', url: aa.attachment_url },
            { label: 'Budget File Attachment', url: aa.budget_info?.attachment_url },
          ].filter(d => d.url);

          if (docs.length === 0) {
            return <p style={{ fontSize: '11px', color: '#888', fontStyle: 'italic', border: '1px solid #ccc', padding: '6px 10px' }}>No documents uploaded.</p>;
          }
          return (
            <div style={{ border: '1px solid black', padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {docs.map(d => <DocLink key={d.label} label={d.label} url={d.url} />)}
            </div>
          );
        })()}
      </div>

      {/* SECTION 5: Declaration */}
      <div style={{ border: '1px solid black', padding: '8px 12px' }}>
        {sectionHead('Section 5 – Declaration')}
        <p style={{ fontSize: '12px', marginBottom: '8px' }}><strong>Certified that:</strong></p>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px', fontSize: '12px' }}>
          <input type="checkbox" checked={!!aa.generic_specification_declaration} readOnly onChange={() => {}} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>The eligibility criteria is not unduly restrictive.</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px' }}>
          <input type="checkbox" checked={!!aa.generic_specification_declaration} readOnly onChange={() => {}} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>
            The demand for goods is not divided into small quantities to make piecemeal purchases to avoid tendering
            or the necessity of obtaining the sanction of higher authorities required with references to the estimated
            value of the total demand.
          </span>
        </div>
      </div>

      {/* SECTION 6: Committee Note – dynamic based on total cost */}
      <div style={{ border: '1px solid black', padding: '10px 12px' }}>
        {sectionHead('Note – Purchase Committee')}
        <p style={{ fontSize: '12px', color: '#333', marginBottom: '8px', fontStyle: 'italic' }}>
          The following committee may finalize the above purchase:
        </p>
        <table style={tableStyle}>
          <tbody>
            <tr>
              <td style={{ ...labelStyle, width: '40%' }}>HOD</td>
              <td style={cellStyle}>{hodName}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Purchase Indentor</td>
              <td style={cellStyle}>{piName}</td>
            </tr>
            {show1Expert && (
              <tr>
                <td style={labelStyle}>Technical Expert 1 (Nominated by HOD)</td>
                <td style={cellStyle}>{expert1Name}</td>
              </tr>
            )}
            {show2Expert && (
              <tr>
                <td style={labelStyle}>Technical Expert 2 (Nominated by HOD)</td>
                <td style={cellStyle}>{expert2Name}</td>
              </tr>
            )}
            {showDirectorNominee && (
              <tr>
                <td style={labelStyle}>Director Nominee (Faculty)</td>
                <td style={cellStyle}>{directorNomineeName}</td>
              </tr>
            )}
            {showArDr && (
              <tr>
                <td style={labelStyle}>AR/DR (Stores & Purchase)</td>
                <td style={cellStyle}>(As per institutional roster)</td>
              </tr>
            )}
            {showIA && (
              <tr>
                <td style={labelStyle}>Internal Auditor (IA)</td>
                <td style={cellStyle}>(As per institutional roster)</td>
              </tr>
            )}
          </tbody>
        </table>
        {showDirectorNominee && (
          <p style={{ fontSize: '12px', color: '#000', marginTop: '10px', fontStyle: 'italic', borderTop: '1px solid #ccc', paddingTop: '8px', lineHeight: '1.6' }}>
            <strong>Note:</strong> The onus of freezing the specification / technical parameters and evaluation of technical parameters shall lie with the <strong>technical sub-committee (TSC)</strong>. PI shall be the convener for such meetings.
          </p>
        )}
      </div>

    </div>
  );
};
