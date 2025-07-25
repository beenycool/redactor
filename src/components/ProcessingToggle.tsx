import React from 'react';

interface ProcessingToggleProps {
  processingType: 'remote' | 'local';
  setProcessingType: (type: 'remote' | 'local') => void;
}

export const ProcessingToggle: React.FC<ProcessingToggleProps> = ({ 
  processingType, 
  setProcessingType 
}) => {
  return (
    <div className="mb-6">
      <div className="inline-flex rounded-md shadow-sm" role="group">
        <button
          onClick={() => setProcessingType('remote')}
          className={`px-4 py-2 text-sm font-medium rounded-l-lg border ${
            processingType === 'remote'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}
        >
          Remote Processing
        </button>
        <button
          onClick={() => setProcessingType('local')}
          className={`px-4 py-2 text-sm font-medium rounded-r-md border ${
            processingType === 'local'
              ? 'bg-blue-600 text-white border-blue-600'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-100'
          }`}
        >
          Local Processing
        </button>
      </div>
    </div>
  );
};