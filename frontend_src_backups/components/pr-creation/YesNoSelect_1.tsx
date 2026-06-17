import React from 'react';

interface Props {
  label: string;
  value: 'Yes' | 'No' | '';
  onChange: (v: 'Yes' | 'No') => void;
  required?: boolean;
  id?: string;
}

export const YesNoSelect: React.FC<Props> = ({ label, value, onChange, required, id }) => (
  <div>
    <label className="label" htmlFor={id}>
      {label}
      {required && <span className="text-red-500"> *</span>}
    </label>
    <select
      id={id}
      required={required}
      className="input-field bg-white"
      value={value}
      onChange={(e) => onChange(e.target.value as 'Yes' | 'No')}
    >
      <option value="" disabled>
        -- Select --
      </option>
      <option value="Yes">Yes</option>
      <option value="No">No</option>
    </select>
  </div>
);
