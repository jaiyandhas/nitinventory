import React, { useEffect, useState } from 'react';
import { authApi } from '../services/api';

interface TitleSelectProps {
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
  name?: string;
  className?: string;
}

export const TitleSelect: React.FC<TitleSelectProps> = ({
  value,
  onChange,
  defaultValue,
  name = 'title',
  className = 'input-field w-24 shrink-0',
}) => {
  return (
    <select
      name={name}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      defaultValue={defaultValue}
      className={className}
    >
      <option value="Mr.">Mr.</option>
      <option value="Mrs.">Mrs.</option>
      <option value="Ms.">Ms.</option>
      <option value="Dr.">Dr.</option>
      <option value="Prof.">Prof.</option>
    </select>
  );
};

interface DesignationSelectProps {
  value?: string;
  onChange?: (val: string) => void;
  defaultValue?: string;
  name?: string;
  className?: string;
  required?: boolean;
  designations?: string[];
}

export const DesignationSelect: React.FC<DesignationSelectProps> = ({
  value,
  onChange,
  defaultValue,
  name = 'designation',
  className = 'input-field w-full',
  required = true,
  designations: propDesignations,
}) => {
  const [localDesignations, setLocalDesignations] = useState<string[]>([]);

  useEffect(() => {
    if (propDesignations) {
      setLocalDesignations(propDesignations);
    } else {
      let isMounted = true;
      authApi.designations()
        .then((res) => {
          if (isMounted && res.data) {
            setLocalDesignations(res.data);
          }
        })
        .catch((err) => console.error('Failed to load designations in select component:', err));
      return () => {
        isMounted = false;
      };
    }
  }, [propDesignations]);

  return (
    <select
      name={name}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      defaultValue={defaultValue}
      className={className}
      required={required}
    >
      <option value="">Select Designation</option>
      {localDesignations.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
};
