'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export interface ComboboxOption {
  id: string;
  label: string;
  sublabel?: string;
  badge?: string;
}

interface SearchableComboboxProps {
  options: ComboboxOption[];
  value: string; // selected id or label
  onChange: (id: string, option?: ComboboxOption) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  allowCustomText?: boolean;
  onCustomTextChange?: (text: string) => void;
  helperText?: string;
}

const normalizeStr = (str: string) =>
  (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export function SearchableCombobox({
  options,
  value,
  onChange,
  placeholder = 'Buscar o seleccionar...',
  disabled = false,
  required = false,
  allowCustomText = false,
  onCustomTextChange,
  helperText,
}: SearchableComboboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Find currently selected option object
  const selectedOption = useMemo(() => {
    const normValue = normalizeStr(value);
    return options.find(
      (opt) => opt.id === value || normalizeStr(opt.label) === normValue
    );
  }, [options, value]);

  // Display text in input
  const displayText = useMemo(() => {
    if (isOpen) return query;
    return selectedOption?.label || value || '';
  }, [isOpen, query, selectedOption?.label, value]);

  // Filtered options based on query
  const filteredOptions = useMemo(() => {
    if (!query.trim()) return options;
    const q = normalizeStr(query);
    return options.filter((opt) => {
      const labelNorm = normalizeStr(opt.label);
      const sublabelNorm = normalizeStr(opt.sublabel || '');
      const badgeNorm = normalizeStr(opt.badge || '');
      return labelNorm.includes(q) || sublabelNorm.includes(q) || badgeNorm.includes(q);
    });
  }, [options, query]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputFocus = () => {
    if (disabled) return;
    setQuery('');
    setIsOpen(true);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (allowCustomText && onCustomTextChange) {
      onCustomTextChange(val);
    }

    // Try to auto-match option if user typed full label
    const normVal = normalizeStr(val);
    if (normVal) {
      const exactMatch = options.find((opt) => normalizeStr(opt.label) === normVal);
      if (exactMatch) {
        onChange(exactMatch.id, exactMatch);
      }
    }
  };

  const handleSelectOption = (opt: ComboboxOption) => {
    onChange(opt.id, opt);
    if (allowCustomText && onCustomTextChange) {
      onCustomTextChange(opt.label);
    }
    setQuery(opt.label);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          value={displayText}
          onFocus={handleInputFocus}
          onChange={handleInputChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 pr-10 text-sm font-semibold text-slate-900 shadow-xs focus:border-sky-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-500"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
        >
          <svg className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {helperText && <p className="mt-1 text-[11px] text-slate-500">{helperText}</p>}

      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl ring-1 ring-black/5">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-400 italic">
              {allowCustomText ? 'Escribe el nombre deseado...' : 'No se encontraron resultados'}
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = opt.id === value || opt.label === value;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold transition ${
                    isSelected ? 'bg-sky-50 text-sky-900 font-bold' : 'text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0 flex-1 truncate">
                    <span className="block truncate text-slate-900 font-semibold">{opt.label}</span>
                    {opt.sublabel && <span className="block text-[11px] font-normal text-slate-500 truncate">{opt.sublabel}</span>}
                  </div>
                  {opt.badge && (
                    <span className="ml-2 shrink-0 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200">
                      {opt.badge}
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
