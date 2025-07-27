import React from 'react';
import { Shield, Download, Upload, Trash2, Sun, Moon } from 'lucide-react';
import { useTheme } from '@/lib/ThemeContext';

interface HeaderProps {
  onClear: () => void;
  onFileUpload: (file: File) => void;
  onExport?: () => void;
  isExportDisabled: boolean;
}

export const Header: React.FC<HeaderProps> = ({ onClear, onFileUpload, onExport, isExportDisabled }) => {
  const { theme, toggleTheme } = useTheme();
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
    e.target.value = ''; // Reset input
  };

  return (
    <header className="bg-card text-foreground border-b border-border px-4 py-3 flex items-center justify-between shadow-sm z-20">
      <div className="flex items-center gap-3">
        <Shield className="w-7 h-7 text-primary" />
        <h1 className="text-xl font-semibold text-text-primary">Local PII Redactor</h1>
      </div>
      
      <div className="flex items-center gap-2">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-full text-text-secondary hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          aria-label="Toggle theme"
        >
          {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
        </button>

        <div className="w-px h-6 bg-border mx-2"></div>

        <label className="flex items-center gap-2 px-3 py-1.5 text-sm text-text-primary bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors">
          <Upload className="w-4 h-4" />
          <span>Upload</span>
          <input type="file" onChange={handleFileChange} accept=".txt,.md" className="hidden" />
        </label>
        
        <button
          onClick={onExport}
          disabled={isExportDisabled}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>
        
        <button
          onClick={onClear}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          <span>Clear</span>
        </button>
      </div>
    </header>
  );
};