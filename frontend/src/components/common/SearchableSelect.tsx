import React, { useState, useRef, useEffect } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';

export interface SearchableSelectOption {
  id: number;
  name: string;
  email: string;
  department_name?: string;
  department_code?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select nominee...',
  disabled = false,
  clearable = true,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const selectedOption = options.find((opt) => opt.id === value);

  // Reset search when opening/closing
  useEffect(() => {
    if (!isOpen) {
      setSearch('');
    }
  }, [isOpen]);

  const filteredOptions = options.filter((opt) => {
    const term = search.toLowerCase();
    return (
      opt.name.toLowerCase().includes(term) ||
      opt.email.toLowerCase().includes(term) ||
      (opt.department_name && opt.department_name.toLowerCase().includes(term)) ||
      (opt.department_code && opt.department_code.toLowerCase().includes(term))
    );
  });

  const handleSelect = (id: number) => {
    onChange(id);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(null);
  };

  return (
    <div ref={containerRef} className="relative w-full text-slate-700">
      {/* Trigger Button */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between min-h-[42px] px-3.5 py-2 rounded-xl border transition-all duration-200 cursor-pointer text-sm font-medium ${
          disabled
            ? 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'bg-white border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]'
            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
        }`}
      >
        <div className="flex-1 truncate">
          {selectedOption ? (
            <div className="flex flex-col text-left">
              <span className="font-semibold text-slate-800">{selectedOption.name}</span>
              <span className="text-xs text-slate-400 font-medium">
                {selectedOption.email} {selectedOption.department_code ? `(${selectedOption.department_code})` : ''}
              </span>
            </div>
          ) : (
            <span className="text-slate-400 font-medium">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1.5 ml-2">
          {clearable && selectedOption && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
            >
              <X size={14} />
            </button>
          )}
          <ChevronDown
            size={18}
            className={`text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-blue-500' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown Options */}
      {isOpen && !disabled && (
        <div className="absolute z-[100] w-full mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden animate-fadeIn max-h-72 flex flex-col">
          {/* Search Box */}
          <div className="flex items-center border-b border-slate-100 px-3.5 py-2.5 bg-slate-50/50">
            <Search size={16} className="text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              className="w-full bg-transparent border-none outline-none text-sm placeholder-slate-400 font-medium text-slate-700"
              placeholder="Search by name, email, department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* Options List */}
          <div className="overflow-y-auto flex-1 py-1 max-h-52">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((opt) => (
                <div
                  key={opt.id}
                  onClick={() => handleSelect(opt.id)}
                  className={`px-3.5 py-2.5 hover:bg-slate-50 cursor-pointer flex flex-col text-left transition-colors ${
                    value === opt.id ? 'bg-blue-50/40 text-blue-600 hover:bg-blue-50/60 font-semibold' : ''
                  }`}
                >
                  <span className="text-sm text-slate-800 font-semibold">{opt.name}</span>
                  <span className="text-xs text-slate-400 font-medium">
                    {opt.email} {opt.department_name ? `· ${opt.department_name}` : ''}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-3.5 py-4 text-center text-sm text-slate-400 font-medium italic">
                No matching members found
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
