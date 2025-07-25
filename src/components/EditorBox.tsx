import React from 'react';

interface EditorBoxProps {
  title: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  onAction?: () => void;
  actionText?: string;
  actionDisabled?: boolean;
  className?: string;
}

export const EditorBox: React.FC<EditorBoxProps> = ({
  title,
  value,
  onChange,
  readOnly = false,
  placeholder = '',
  onAction,
  actionText,
  actionDisabled = false,
  className = ''
}) => {
  return (
    <div className={className}>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-gray-900">
          {title}
        </h2>
        {onAction && actionText && (
          <button
            onClick={onAction}
            disabled={actionDisabled}
            className={`px-3 py-1 text-sm rounded ${
              actionDisabled
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {actionText}
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full h-48 p-3 border rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          readOnly 
            ? 'bg-gray-50 border-gray-300' 
            : 'bg-white border-gray-300'
        }`}
      />
    </div>
  );
};