import React from 'react';

interface ProcessingToggleProps {
  useLocalProcessing: boolean;
  onToggle: (useLocal: boolean) => void;
}

export const ProcessingToggle: React.FC<ProcessingToggleProps> = ({ useLocalProcessing, onToggle }) => {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600">Processing Mode</label>
      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={() => onToggle(false)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            !useLocalProcessing ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          API
        </button>
        <button
          onClick={() => onToggle(true)}
          className={`px-2 py-1 text-xs rounded transition-colors ${
            useLocalProcessing ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Local
        </button>
      </div>
    </div>
  );
};