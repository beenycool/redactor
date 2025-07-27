'use client';

import { useState } from 'react';
import { Header } from '@/components/Header';
import { DynamicEditor } from '@/components/DynamicEditor';
import { RedactedView } from '@/components/RedactedView';
import { WordList } from '@/components/WordList';
import { ProcessingIndicator } from '@/components/ProcessingIndicator';
import { usePIIProcessor } from '@/lib/hooks/usePIIProcessor';
import { ThemeProvider } from '@/lib/ThemeContext';
import { exportAsText } from '@/lib/export';

// A new, self-contained component for the settings card.
const SettingsCard = ({
  isProcessing,
  hasModels,
  entityCount,
  confidenceThreshold,
  onConfidenceChange,
  alwaysRedactWords,
  setAlwaysRedactWords,
  alwaysIgnoreWords,
  setAlwaysIgnoreWords,
}) => (
  <div className="bg-card border border-border rounded-lg shadow-sm">
    <div className="p-4 border-b border-border">
      <h3 className="font-semibold text-text-primary">Settings</h3>
    </div>
    <div className="p-4 space-y-6">
      <div>
        <h3 className="text-sm font-medium text-text-secondary mb-2">Status</h3>
        <ProcessingIndicator isProcessing={isProcessing} hasModels={hasModels} entityCount={entityCount} />
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
        onAdd={(word) => !alwaysRedactWords.includes(word) && setAlwaysRedactWords([...alwaysRedactWords, word])}
        onRemove={(word) => setAlwaysRedactWords(alwaysRedactWords.filter((w) => w !== word))}
        placeholder="Add word to always redact..."
      />
      <WordList
        title="Always Ignore"
        words={alwaysIgnoreWords}
        onAdd={(word) => !alwaysIgnoreWords.includes(word) && setAlwaysIgnoreWords([...alwaysIgnoreWords, word])}
        onRemove={(word) => setAlwaysIgnoreWords(alwaysIgnoreWords.filter((w) => w !== word))}
        placeholder="Add word to always ignore..."
      />
    </div>
  </div>
);

export default function Home() {
  const {
    originalText,
    redactedText,
    entities,
    isProcessing,
    hasModels,
    confidenceThreshold,
    alwaysRedactWords,
    alwaysIgnoreWords,
    setText,
    setConfidenceThreshold,
    setAlwaysRedactWords,
    setAlwaysIgnoreWords,
  } = usePIIProcessor();

  const handleFileUpload = async (file: File) => {
    try {
      const text = await file.text();
      setText(text);
    } catch (error) {
      console.error('Error reading file:', error);
      // You could add a user-facing error message here
    }
  };

  const handleClear = () => setText('');

  const handleExport = () => {
    if (!redactedText) return;
    exportAsText(redactedText, { filename: 'redacted-output.txt' });
  };

  return (
    <ThemeProvider>
      <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
        <Header
          onClear={handleClear}
          onFileUpload={handleFileUpload}
          onExport={handleExport}
        />
        <main className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left Column: Original Text Editor */}
          <div className="flex-[3] flex flex-col bg-card border border-border rounded-lg shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border">
              <h3 className="font-semibold text-text-primary">Original Text</h3>
            </div>
            <div className="flex-1 p-1 overflow-y-auto custom-scrollbar">
              <DynamicEditor
                content={originalText}
                onChange={setText}
                placeholder="Enter or paste sensitive text here to begin..."
                entities={entities}
              />
            </div>
          </div>

          {/* Right Column: Settings and Output */}
          <div className="flex-[2] flex flex-col gap-4 overflow-hidden">
            {/* Settings Card */}
            <SettingsCard
              isProcessing={isProcessing}
              hasModels={hasModels}
              entityCount={entities.length}
              confidenceThreshold={confidenceThreshold}
              onConfidenceChange={setConfidenceThreshold}
              alwaysRedactWords={alwaysRedactWords}
              setAlwaysRedactWords={setAlwaysRedactWords}
              alwaysIgnoreWords={alwaysIgnoreWords}
              setAlwaysIgnoreWords={setAlwaysIgnoreWords}
            />

            {/* Redacted Output Card */}
            <div className="flex-1 flex flex-col bg-card border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold text-text-primary">Redacted Output</h3>
              </div>
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar">
                <RedactedView content={redactedText} entities={entities} />
              </div>
            </div>
          </div>
        </main>
      </div>
    </ThemeProvider>
  );
}