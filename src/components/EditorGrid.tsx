import React from 'react';
import { EditorBox } from './EditorBox';

interface EditorGridProps {
  originalText: string;
  setOriginalText: (text: string) => void;
  redactedText: string;
  modifiedText: string;
  setModifiedText: (text: string) => void;
  restoredText: string;
  onRedact: () => void;
  onRestore: () => void;
  isProcessing: boolean;
  isRedactDisabled: boolean;
  isRestoreDisabled: boolean;
}

export const EditorGrid: React.FC<EditorGridProps> = ({
  originalText,
  setOriginalText,
  redactedText,
  modifiedText,
  setModifiedText,
  restoredText,
  onRedact,
  onRestore,
  isProcessing,
  isRedactDisabled,
  isRestoreDisabled
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Box 1: Original Report */}
      <EditorBox
        title="Box 1: Original text"
        value={originalText}
        onChange={setOriginalText}
        placeholder="Paste your court report or psychiatric report here..."
        onAction={onRedact}
        actionText={isProcessing ? 'Processing...' : 'Redact PII'}
        actionDisabled={isProcessing || isRedactDisabled}
      />

      {/* Box 2: Redacted Report */}
      <EditorBox
        title="Box 2: Redacted text"
        value={redactedText}
        readOnly
        placeholder="Redacted text will appear here..."
      />

      {/* Box 3: Modified Text */}
      <EditorBox
        title="Box 3: Modified Text"
        value={modifiedText}
        onChange={setModifiedText}
        placeholder="Edit the redacted text as needed..."
        onAction={onRestore}
        actionText="Restore PII"
        actionDisabled={isProcessing || isRedactDisabled || isRestoreDisabled}
      />

      {/* Box 4: Restored Report */}
      <EditorBox
        title="Box 4: Restored text"
        value={restoredText}
        readOnly
        placeholder="Restored text will appear here..."
      />
    </div>
  );
};