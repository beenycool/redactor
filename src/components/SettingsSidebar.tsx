import React from 'react';
import { WordList } from '@/components/WordList';
import { ProcessingIndicator } from '@/components/ProcessingIndicator';
import { ChevronLeft } from 'lucide-react';

interface SettingsSidebarProps {
  show: boolean;
  onClose: () => void;
  isProcessing: boolean;
  hasModels: boolean;
  entityCount: number;
  confidenceThreshold: number;
  onConfidenceChange: (value: number) => void;
  alwaysRedactWords: string[];
  onAddRedactWord: (word: string) => void;
  onRemoveRedactWord: (word: string) => void;
  alwaysIgnoreWords: string[];
  onAddIgnoreWord: (word: string) => void;
  onRemoveIgnoreWord: (word: string) => void;
}

export const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
  show,
  onClose,
  isProcessing,
  hasModels,
  entityCount,
  confidenceThreshold,
  onConfidenceChange,
  alwaysRedactWords,
  onAddRedactWord,
  onRemoveRedactWord,
  alwaysIgnoreWords,
  onAddIgnoreWord,
  onRemoveIgnoreWord,
}) => {
  return (
    <aside
      className={`
        flex-shrink-0 bg-card border-r border-border transition-all duration-300 ease-in-out
        ${show ? 'w-80' : 'w-0'}
      `}
    >
      <div className="h-full flex flex-col overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-text-primary">Settings</h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-2">Status</h3>
            <ProcessingIndicator
              isProcessing={isProcessing}
              hasModels={hasModels}
              entityCount={entityCount}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Confidence Threshold: <span className="font-semibold text-primary">{confidenceThreshold.toFixed(2)}</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={confidenceThreshold}
              onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
              className="w-full slider"
            />
            <div className="flex justify-between text-xs text-text-secondary mt-1">
              <span>Less Strict</span>
              <span>More Strict</span>
            </div>
          </div>

          <WordList
            title="Always Redact"
            words={alwaysRedactWords}
            onAdd={onAddRedactWord}
            onRemove={onRemoveRedactWord}
            placeholder="Add word to always redact..."
          />

          <WordList
            title="Always Ignore"
            words={alwaysIgnoreWords}
            onAdd={onAddIgnoreWord}
            onRemove={onRemoveIgnoreWord}
            placeholder="Add word to always ignore..."
          />
        </div>
      </div>
    </aside>
  );