import React, { useState } from 'react';

interface RemarksCellProps {
  text: string | null | undefined;
  preview?: number;
  emptyLabel?: string;
  title?: string;
}

export const RemarksCell: React.FC<RemarksCellProps> = ({
  text,
  preview = 80,
  emptyLabel = '—',
  title = 'Remarks',
}) => {
  const [open, setOpen] = useState(false);

  const clean = text && text !== '-' ? text.trim() : '';
  if (!clean) {
    return <span className="text-slate-400 italic text-xs">{emptyLabel}</span>;
  }

  const isLong = clean.length > preview;

  return (
    <>
      <div className="flex items-start gap-1.5 min-w-0">
        <span className="text-xs text-slate-600 italic leading-relaxed break-words min-w-0">
          {isLong ? `${clean.slice(0, preview).trimEnd()}…` : clean}
        </span>
        {isLong && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 text-[10px] font-semibold text-[#1a3a6b] hover:underline whitespace-nowrap mt-px"
          >
            View
          </button>
        )}
      </div>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-lg flex flex-col"
            style={{ maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 shrink-0">
              <h3 className="font-semibold text-slate-800 text-sm">{title}</h3>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="w-7 h-7 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            {/* Body */}
            <div
              className="px-5 py-4 overflow-y-auto text-sm text-slate-700 leading-relaxed"
              style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
            >
              {clean}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
