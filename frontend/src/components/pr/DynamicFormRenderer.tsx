import React from 'react';

interface SchemaProperty {
  type: string;
  title?: string;
  enum?: string[];
  description?: string;
}

interface JSONSchema {
  type: string;
  title?: string;
  properties: Record<string, SchemaProperty>;
  required?: string[];
}

interface DynamicFormRendererProps {
  schema: JSONSchema | null;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
}

export const DynamicFormRenderer: React.FC<DynamicFormRendererProps> = ({
  schema,
  value,
  onChange,
}) => {
  if (!schema || !schema.properties) {
    return null;
  }

  const handleFieldChange = (field: string, fieldValue: any) => {
    onChange({
      ...value,
      [field]: fieldValue,
    });
  };

  return (
    <div className="space-y-4 border border-slate-200 rounded-lg p-5 bg-slate-50/50 shadow-xs">
      {schema.title && (
        <h4 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span className="w-1.5 h-3 bg-[#1a3a6b] rounded-xs"></span>
          {schema.title}
        </h4>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(schema.properties).map(([fieldName, prop]) => {
          const isRequired = schema.required?.includes(fieldName);
          const currentValue = value[fieldName] !== undefined ? value[fieldName] : '';

          return (
            <div key={fieldName} className="space-y-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">
                {prop.title || fieldName}
                {isRequired && <span className="text-red-500 ml-1">*</span>}
              </label>

              {prop.enum ? (
                <select
                  value={currentValue}
                  onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                  className="input-field w-full text-sm bg-white"
                  required={isRequired}
                >
                  <option value="">Select option...</option>
                  {prop.enum.map((option) => (
                    <option key={option} value={option}>
                      {option.replace(/_/g, ' ').toUpperCase()}
                    </option>
                  ))}
                </select>
              ) : prop.type === 'boolean' ? (
                <div className="flex items-center pt-2">
                  <input
                    type="checkbox"
                    checked={!!currentValue}
                    onChange={(e) => handleFieldChange(fieldName, e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#1a3a6b] focus:ring-[#1a3a6b] cursor-pointer"
                  />
                  <span className="ml-2 text-xs font-medium text-slate-600">
                    {prop.description || 'Check to confirm'}
                  </span>
                </div>
              ) : prop.type === 'number' || prop.type === 'integer' ? (
                <input
                  type="number"
                  value={currentValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleFieldChange(fieldName, val === '' ? '' : Number(val));
                  }}
                  className="input-field w-full text-sm bg-white"
                  required={isRequired}
                  placeholder={`Enter ${prop.title?.toLowerCase() || 'value'}...`}
                />
              ) : (
                <input
                  type="text"
                  value={currentValue}
                  onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                  className="input-field w-full text-sm bg-white"
                  required={isRequired}
                  placeholder={`Enter ${prop.title?.toLowerCase() || 'value'}...`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
