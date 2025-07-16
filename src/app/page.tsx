'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { FileUploadError, handleFileUpload, createFileInput } from '@/lib/fileUpload';
import { sessionManager, autoSaveManager } from '@/lib/session';
import { exportAsText, copyToClipboard } from '@/lib/export';

interface PIIMapping {
  [key: string]: string;
}

interface PIIStats {
  [category: string]: number;
}

interface ProcessingStats {
  startTime: number;
  endTime: number;
  duration: number;
}

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [piiMapping, setPiiMapping] = useState<PIIMapping>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingType, setProcessingType] = useState<'remote' | 'local'>('remote');
  const [darkMode, setDarkMode] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [replaceTerm, setReplaceTerm] = useState('');
  const [customName, setCustomName] = useState('');
  const [customNames, setCustomNames] = useState<string[]>([]);
  const [piiStats, setPiiStats] = useState<PIIStats>({});
  const [processingStats, setProcessingStats] = useState<ProcessingStats | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalTextRef = useRef<HTMLTextAreaElement>(null);
  const modifiedTextRef = useRef<HTMLTextAreaElement>(null);

  // Load saved session on mount
  useEffect(() => {
    const savedSession = sessionManager.load();
    if (savedSession) {
      setOriginalText(savedSession.originalText);
      setRedactedText(savedSession.redactedText);
      setModifiedText(savedSession.modifiedText);
      setPiiMapping(savedSession.piiMapping);
    }

    const autoSave = autoSaveManager.load();
    if (autoSave) {
      setOriginalText(autoSave.originalText || '');
      setModifiedText(autoSave.modifiedText || '');
    }

    // Load dark mode preference
    const savedDarkMode = localStorage.getItem('darkMode') === 'true';
    setDarkMode(savedDarkMode);
    if (savedDarkMode) {
      document.documentElement.classList.add('dark');
    }
  }, []);

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveEnabled) {
      const timer = setTimeout(() => {
        autoSaveManager.save({
          originalText,
          modifiedText
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [originalText, modifiedText, autoSaveEnabled]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRedact();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey || (e.metaKey || e.ctrlKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [originalText]);

  const processWithRemoteAPI = async (text: string) => {
    try {
      const response = await fetch('/api/redact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, type: 'remote' }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Remote processing error:', error);
      throw error;
    }
  };

  const processWithLocalModel = async (text: string) => {
    try {
      const response = await fetch('/api/redact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, type: 'local' }),
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Local processing error:', error);
      throw error;
    }
  };

  const handleRedact = async () => {
    if (!originalText.trim()) return;
    
    const startTime = Date.now();
    setIsProcessing(true);
    
    try {
      const result = processingType === 'remote' 
        ? await processWithRemoteAPI(originalText)
        : await processWithLocalModel(originalText);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      setRedactedText(result.redacted);
      setPiiMapping(result.mapping);
      setModifiedText(result.redacted);
      setProcessingStats({ startTime, endTime, duration });
      
      // Calculate PII statistics
      const stats: PIIStats = {};
      Object.values(result.mapping).forEach(original => {
        const category = String(original).split('_')[0];
        stats[category] = (stats[category] || 0) + 1;
      });
      setPiiStats(stats);
      
      // Save to history
      addToHistory(result.redacted);
      
      // Save session
      sessionManager.save({
        originalText,
        redactedText: result.redacted,
        modifiedText: result.redacted,
        piiMapping: result.mapping,
        timestamp: new Date().toISOString(),
        processingTime: duration,
        piiCounts: stats
      });
    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing text. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = () => {
    if (!modifiedText.trim() || Object.keys(piiMapping).length === 0) return;
    
    let restored = modifiedText;
    Object.entries(piiMapping).forEach(([placeholder, original]) => {
      restored = restored.replace(new RegExp(placeholder, 'g'), original);
    });
    
    setRestoredText(restored);
  };

  const processFileUpload = async (file: File) => {
    try {
      const result = await handleFileUpload(file);
      setOriginalText(result.text);
    } catch (error) {
      if (error instanceof FileUploadError) {
        alert(error.message);
      } else {
        alert('Failed to upload file');
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFileUpload(files[0]);
    }
  };

  const handleExport = () => {
    if (!modifiedText.trim()) return;
    exportAsText(modifiedText);
  };

  const handleCopy = async (text: string) => {
    try {
      await copyToClipboard(text);
    } catch (error) {
      alert('Failed to copy to clipboard');
    }
  };

  const handleClear = () => {
    setOriginalText('');
    setRedactedText('');
    setModifiedText('');
    setRestoredText('');
    setPiiMapping({});
    setPiiStats({});
    setProcessingStats(null);
    setHistory([]);
    setHistoryIndex(-1);
    sessionManager.clear();
  };

  const handleSearchReplace = () => {
    if (!searchTerm || !modifiedText) return;
    
    const newText = modifiedText.replace(new RegExp(searchTerm, 'gi'), replaceTerm);
    setModifiedText(newText);
    addToHistory(newText);
  };

  const addToHistory = (text: string) => {
    const newHistory = [...history.slice(0, historyIndex + 1), text];
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setModifiedText(history[newIndex]);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setModifiedText(history[newIndex]);
    }
  };

  const toggleDarkMode = () => {
    const newDarkMode = !darkMode;
    setDarkMode(newDarkMode);
    localStorage.setItem('darkMode', String(newDarkMode));
    if (newDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  const addCustomName = () => {
    if (customName.trim()) {
      setCustomNames([...customNames, customName.trim()]);
      setCustomName('');
    }
  };

  const renderDiff = () => {
    if (!originalText || !redactedText) return null;
    
    const originalWords = originalText.split(/\s+/);
    const redactedWords = redactedText.split(/\s+/);
    
    return (
      <div className="text-sm">
        {originalWords.map((word, index) => {
          const isRedacted = redactedWords[index] !== word;
          return (
            <span key={index} className={isRedacted ? 'bg-red-200 dark:bg-red-800' : ''}>
              {word}{' '}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className={`min-h-screen p-4 md:p-8 ${darkMode ? 'dark bg-gray-900' : 'bg-white'}`}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            PII Redactor
          </h1>
          <div className="flex gap-2">
            <button
              onClick={toggleDarkMode}
              className={`px-3 py-1 rounded ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <button
              onClick={() => setProcessingType('remote')}
              className={`px-4 py-2 rounded-lg font-medium ${
                processingType === 'remote'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Remote Processing
            </button>
            <button
              onClick={() => setProcessingType('local')}
              className={`px-4 py-2 rounded-lg font-medium ${
                processingType === 'local'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Local Processing
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Add custom name"
              className="px-3 py-2 border rounded-lg"
            />
            <button
              onClick={addCustomName}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add
            </button>
          </div>

          <button
            onClick={() => setShowDiff(!showDiff)}
            className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            {showDiff ? 'Hide Diff' : 'Show Diff'}
          </button>

          <button
            onClick={handleExport}
            disabled={!modifiedText.trim()}
            className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
          >
            Export
          </button>
        </div>

        {/* File Upload Area */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-6 p-6 border-2 border-dashed rounded-lg text-center ${
            isDragging ? 'border-blue-500 bg-blue-100 dark:bg-blue-900/30' : 'border-gray-400 dark:border-gray-600'
          } ${darkMode ? 'bg-gray-800/50' : 'bg-gray-100'}`}
        >
          <p className="mb-2">Drag & drop files here or</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Choose File
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,.doc"
            onChange={handleFileInput}
            className="hidden"
          />
          <p className="text-sm text-gray-500 mt-2">Supports .txt, .pdf, .docx files</p>
        </div>

        {/* Statistics */}
        {Object.keys(piiStats).length > 0 && (
          <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'} shadow-md border ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
            <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              Processing Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(piiStats).map(([category, count]) => (
                <div key={category} className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{count}</div>
                  <div className="text-sm text-gray-500">{category}</div>
                </div>
              ))}
              {processingStats && (
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {processingStats.duration}ms
                  </div>
                  <div className="text-sm text-gray-500">Processing Time</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search and Replace */}
        <div className={`mb-6 p-4 rounded-lg ${darkMode ? 'bg-gray-800' : 'bg-gray-50'} shadow-md border ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Search & Replace
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg"
            />
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              className="flex-1 px-3 py-2 border rounded-lg"
            />
            <button
              onClick={handleSearchReplace}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Replace
            </button>
          </div>
        </div>

        {/* Text Areas */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Original Input */}
          <div className={`rounded-lg shadow-md p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Original Text
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(originalText)}
                  className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Copy
                </button>
                <button
                  onClick={handleRedact}
                  disabled={isProcessing || !originalText.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Processing...
                    </>
                  ) : (
                    'Redact PII (⌘+Enter)'
                  )}
                </button>
              </div>
            </div>
            <textarea
              ref={originalTextRef}
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              placeholder="Paste your text here..."
              className={`w-full h-64 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y ${
                darkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white border-gray-400'
              }`}
              disabled={isProcessing}
            />
          </div>

          {/* Redacted Output */}
          <div className={`rounded-lg shadow-md p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Redacted Text
              </h2>
              <button
                onClick={() => handleCopy(redactedText)}
                className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Copy
              </button>
            </div>
            {showDiff && redactedText ? (
              <div className={`w-full h-64 p-3 border rounded-lg overflow-auto ${
                darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
              }`}>
                {renderDiff()}
              </div>
            ) : (
              <textarea
                value={redactedText}
                readOnly
                placeholder="Redacted text will appear here..."
                className={`w-full h-64 p-3 border rounded-lg resize-y ${
                  darkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-gray-100 border-gray-400'
                }`}
              />
            )}
          </div>

          {/* Modified Text */}
          <div className={`rounded-lg shadow-md p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Edited Text
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(modifiedText)}
                  className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Copy
                </button>
                <button
                  onClick={handleUndo}
                  disabled={historyIndex <= 0}
                  className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  Undo
                </button>
                <button
                  onClick={handleRedo}
                  disabled={historyIndex >= history.length - 1}
                  className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
                >
                  Redo
                </button>
              </div>
            </div>
            <textarea
              ref={modifiedTextRef}
              value={modifiedText}
              onChange={(e) => {
                setModifiedText(e.target.value);
                addToHistory(e.target.value);
              }}
              placeholder="Edit the redacted text as needed..."
              className={`w-full h-64 p-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y ${
                darkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-white border-gray-400'
              }`}
            />
          </div>

          {/* Restored Text */}
          <div className={`rounded-lg shadow-md p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-4">
              <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                Restored Text
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCopy(restoredText)}
                  className="px-2 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                >
                  Copy
                </button>
                <button
                  onClick={handleRestore}
                  disabled={!modifiedText.trim() || Object.keys(piiMapping).length === 0}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  Restore PII
                </button>
              </div>
            </div>
            <textarea
              value={restoredText}
              readOnly
              placeholder="Restored text will appear here..."
              className={`w-full h-64 p-3 border rounded-lg resize-y ${
                darkMode ? 'bg-gray-800 text-white border-gray-700' : 'bg-gray-100 border-gray-400'
              }`}
            />
          </div>
        </div>

        {/* PII Mapping Display */}
        {(Object.keys(piiMapping).length > 0 || customNames.length > 0) && (
          <div className={`mt-8 rounded-lg shadow-md p-6 ${darkMode ? 'bg-gray-800' : 'bg-white'}`}>
            <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
              PII Mapping
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Existing PII mappings */}
              {Object.entries(piiMapping).map(([placeholder, original]) => (
                <div key={placeholder} className={`flex items-center gap-2 p-2 rounded border ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'
                }`}>
                  <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{placeholder}</span>
                  <span className="text-gray-500 dark:text-gray-400">→</span>
                  <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{original}</span>
                </div>
              ))}
              
              {/* Custom names */}
              {customNames.map((name, index) => (
                <div key={index} className={`flex items-center gap-2 p-2 rounded border ${
                  darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-300'
                }`}>
                  <span className="font-mono text-sm text-green-600 dark:text-green-400">NAME_{index+1}</span>
                  <span className="text-gray-500 dark:text-gray-400">→</span>
                  <span className={`text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-900'}`}>{name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}