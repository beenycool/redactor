import React from 'react';
import { PIIEntity } from '@/lib/types';

interface RedactedViewProps {
  content: string;
  entities?: PIIEntity[];
}

export const RedactedView: React.FC<RedactedViewProps> = ({ content, entities = [] }) => {
  const renderContent = () => {
    if (!content) {
      return (
        <div className="flex items-center justify-center h-32 text-gray-500">
          <p>No redacted content to display</p>
        </div>
      );
    }

    return (
      <div 
        className="w-full h-full p-4 text-base font-mono bg-white border border-gray-200 rounded-md overflow-auto"
        style={{
          lineHeight: '1.6',
          fontSize: '14px',
          fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
          whiteSpace: 'pre-wrap',
          wordWrap: 'break-word'
        }}
      >
        {content}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      {entities.length > 0 && (
        <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-blue-800">
              {entities.length} PII entities redacted
            </span>
            <div className="flex gap-2 text-xs">
              {Array.from(new Set(entities.map(e => e.entity_group))).map(type => (
                <span 
                  key={type} 
                  className="px-2 py-1 bg-white rounded border border-blue-300 text-blue-700"
                >
                  {type}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="flex-1">
        {renderContent()}
      </div>
    </div>
  );
};
