import React from 'react';

interface ProcessingIndicatorProps {
  isProcessing: boolean;
  hasModels: boolean;
  entityCount?: number;
}

export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ 
  isProcessing, 
  hasModels,
  entityCount = 0
}) => {
  if (!hasModels) {
    return (
      <div className="flex items-center text-amber-600">
        <div className="w-3 h-3 bg-amber-500 rounded-full animate-pulse mr-2" />
        <span className="text-sm font-medium">Loading models...</span>
      </div>
    );
  }

  if (isProcessing) {
    return (
      <div className="flex items-center text-blue-600">
        <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse mr-2" />
        <span className="text-sm font-medium">Processing...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center text-green-600">
      <div className="w-3 h-3 bg-green-500 rounded-full mr-2" />
      <span className="text-sm font-medium">
        Ready {entityCount > 0 && `• ${entityCount} entities detected`}
      </span>
    </div>
  );
};
