import React, { useRef } from 'react';
import { Trash2, Upload } from 'lucide-react';

interface CompactHeaderProps {
  onClear: () => void;
  onFileUpload?: (file: File) => void;
}

export const CompactHeader: React.FC<CompactHeaderProps> = ({ onClear, onFileUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && onFileUpload) {
      onFileUpload(file);
    }
    // Reset input value to allow selecting the same file again
    if (event.target) {
      event.target.value = '';
    }
  };

  return (
    <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-200">
      <div className="flex items-center">
        <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center mr-2">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div>
          <h1 className="text-base font-semibold text-gray-900">PII Redactor</h1>
          <p className="text-xs text-gray-600 hidden sm:block">Privacy protection for sensitive documents</p>
        </div>
      </div>
      
      <div className="flex items-center gap-1">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
          title="Upload file"
        >
          <Upload className="w-3 h-3" />
          <span className="hidden sm:inline">Upload</span>
        </button>
        
        <button
          onClick={onClear}
          className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
          title="Clear all"
        >
          <Trash2 className="w-3 h-3" />
          <span className="hidden sm:inline">Clear</span>
        </button>
        
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.doc,.docx,.pdf"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  );
};