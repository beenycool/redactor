import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import TextBox from '../components/TextBox';
import { redactionService, RedactionToken } from '../services/redactionService';
import { tokensToJson, parseTokensFromJson, tokensByTypeCount } from '../utils/tokenUtils';
import { getPIITypeClass } from '../components/PIIBadge';

const SLIDER_MIN = 0.0;
const SLIDER_MAX = 1.0;
const SLIDER_STEP = 0.01;
const DEFAULT_CONFIDENCE = 0.5;

// Maximum history size to prevent memory issues
const MAX_HISTORY_SIZE = 100;

const SAMPLE_TEXTS = [
  {
    name: "Court Report",
    text: "John Doe appeared before Judge Smith on Case No. 2024-CR-1234..."
  },
  {
    name: "Medical Record",
    text: "Patient Jane Smith, SSN 123-45-6789, visited on 01/15/2024..."
  }
  // Add more if desired
];

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [tokensJson, setTokensJson] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [llmOutput, setLlmOutput] = useState('');
  // Confidence threshold state
  const [confidenceThreshold, setConfidenceThreshold] = useState(DEFAULT_CONFIDENCE);

  // Undo/Redo state history
  type HistoryState = {
    originalText: string;
    redactedText: string;
    tokensJson: string;
    tokens: RedactionToken[];
  };
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1); // -1 means no history yet

  // Helper to push new state to history
  const pushHistory = useCallback((newState: HistoryState) => {
    setHistory(prev => {
      // If not at end, truncate future
      const truncated = historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : prev;
      const updated = [...truncated, newState];
      // Enforce maximum history size
      if (updated.length > MAX_HISTORY_SIZE) {
        // Remove oldest entries
        return updated.slice(updated.length - MAX_HISTORY_SIZE);
      }
      return updated;
    });
    setHistoryIndex(idx => {
      // If history was truncated, keep index at the end
      const newLength = historyIndex >= 0 ? Math.min(historyIndex + 1, MAX_HISTORY_SIZE - 1) : 0;
      return newLength;
    });
  }, [historyIndex]);

  // Undo handler
  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const prevState = history[historyIndex - 1];
      setOriginalText(prevState.originalText);
      setRedactedText(prevState.redactedText);
      setTokensJson(prevState.tokensJson);
      currentTokensRef.current = prevState.tokens;
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);

  // Redo handler
  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setOriginalText(nextState.originalText);
      setRedactedText(nextState.redactedText);
      setTokensJson(nextState.tokensJson);
      currentTokensRef.current = nextState.tokens;
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);

  // Loading states
  const [isRedacting, setIsRedacting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  // Error states
  const [redactionError, setRedactionError] = useState('');
  const [restorationError, setRestorationError] = useState('');

  // Store tokens for restoration
  const currentTokensRef = useRef<RedactionToken[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Local debounce helper
  const resetDebounce = useCallback((callback: () => void, delay: number = 500) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(callback, delay);
  }, []);

    // Debounced redaction function
    const performRedaction = useCallback(
      async (text: string, threshold: number = confidenceThreshold, recordHistory: boolean = true) => {
        if (!text.trim()) {
          setRedactedText('');
          setTokensJson('');
          currentTokensRef.current = [];
          if (recordHistory) {
            pushHistory({
              originalText: '',
              redactedText: '',
              tokensJson: '',
              tokens: [],
            });
          }
          return;
        }
  
        setIsRedacting(true);
        setRedactionError('');
  
        try {
          const result = await redactionService.redactText(text, threshold);
          setRedactedText(result.redactedText);
          currentTokensRef.current = result.tokens;
          setTokensJson(tokensToJson(result.tokens, true));
          if (recordHistory) {
            pushHistory({
              originalText: text,
              redactedText: result.redactedText,
              tokensJson: tokensToJson(result.tokens, true),
              tokens: result.tokens,
            });
          }
        } catch (error) {
          setRedactionError(error instanceof Error ? error.message : 'Failed to redact text');
          console.error('Redaction error:', error);
        } finally {
          setIsRedacting(false);
        }
      },
      [confidenceThreshold, pushHistory]
    );

    // Debounced handler for original text changes
    const handleOriginalTextChange = useCallback(
      (text: string) => {
        setOriginalText(text);
        resetDebounce(() => {
          performRedaction(text, confidenceThreshold, true);
        });
      },
      [performRedaction, confidenceThreshold, resetDebounce]
    );

  // Perform restoration when LLM output changes
  const performRestoration = useCallback(async (text: string) => {
    if (!text.trim() || currentTokensRef.current.length === 0) {
      setRestoredText('');
      return;
    }

    setIsRestoring(true);
    setRestorationError('');
    
    try {
      const restored = await redactionService.restoreText(text, currentTokensRef.current);
      setRestoredText(restored);
    } catch (error) {
      setRestorationError(error instanceof Error ? error.message : 'Failed to restore text');
      console.error('Restoration error:', error);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  // Debounced handler for LLM output changes
  const handleLlmOutputChange = useCallback((text: string) => {
    setLlmOutput(text);
    resetDebounce(() => {
      performRestoration(text);
    });
  }, [performRestoration, resetDebounce]);

    // Clear all fields
    const handleClearAll = () => {
      setOriginalText('');
      setRedactedText('');
      setTokensJson('');
      setRestoredText('');
      setLlmOutput('');
      setRedactionError('');
      setRestorationError('');
      currentTokensRef.current = [];
      setHistory([]);
      setHistoryIndex(-1);
    };

  // Copy redacted text to LLM output box
  const handleCopyToLlm = () => {
    setLlmOutput(redactedText);
    performRestoration(redactedText);
  };

  // Quick Action Handlers
  const [toastMessage, setToastMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
      toastTimeoutRef.current = null;
    }, 2000);
  }, []);

  const handleCopyRedacted = useCallback(() => {
      if (!redactedText) {
        showToast('Nothing to copy');
        return;
      }
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        navigator.clipboard.writeText(redactedText)
          .then(() => showToast('Copied to clipboard!'))
          .catch(() => showToast('Failed to copy'));
      } else {
        showToast('Clipboard functionality not supported');
      }
    }, [redactedText, showToast]);

  const handleDownloadTokens = useCallback(() => {
    try {
      const blob = new Blob([tokensJson || '[]'], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `redaction-tokens-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Tokens downloaded');
    } catch {
      showToast('Failed to download tokens');
    }
  }, [tokensJson, showToast]);

  const handleImportTokens = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = parseTokensFromJson(text);
        if (!parsed || !Array.isArray(parsed) || parsed.length === 0) {
          showToast('No tokens found in file');
          return;
        }
        // Apply imported tokens to current session
        currentTokensRef.current = parsed as RedactionToken[];
        setTokensJson(tokensToJson(parsed as RedactionToken[], true));
        showToast('Tokens imported');
      } catch (e) {
        console.error('Failed to import tokens', e);
        showToast('Invalid tokens file');
      }
    };
    reader.onerror = () => showToast('Failed to read file');
    reader.readAsText(file);
  }, [showToast]);

  const handleOpenFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // Check API health on mount
  useEffect(() => {
    const checkApiHealth = async () => {
      try {
        const isHealthy = await redactionService.checkHealth();
        if (!isHealthy) {
          setRedactionError('Backend API is not available. Please ensure the backend is running.');
        }
      } catch (error) {
        setRedactionError('Cannot connect to backend API. Please ensure the backend is running on http://localhost:8000');
      }
    };
    
    checkApiHealth();
  }, []);

  // Cleanup any pending debounce timers and toast timeout on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
    };
  }, []);

    // Keyboard shortcuts
    // Ctrl/Cmd+Enter: perform redaction
    // Ctrl/Cmd+D: clear all
    // Ctrl/Cmd+C: copy redacted
    // Ctrl/Cmd+Z: undo, Ctrl/Cmd+Y: redo
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (!(e.ctrlKey || e.metaKey)) return;
  
        // Avoid interfering while typing in inputs except when triggering explicit combos
        const key = e.key;
        switch (key) {
          case 'Enter': {
            e.preventDefault();
            performRedaction(originalText, confidenceThreshold);
            break;
          }
          case 'd':
          case 'D': {
            e.preventDefault();
            handleClearAll();
            break;
          }
          case 'c':
          case 'C': {
            e.preventDefault();
            // Use existing handler which shows toast feedback
            handleCopyRedacted();
            break;
          }
          case 'z':
          case 'Z': {
            e.preventDefault();
            handleUndo();
            break;
          }
          case 'y':
          case 'Y': {
            e.preventDefault();
            handleRedo();
            break;
          }
          default:
            break;
        }
      };
  
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [originalText, performRedaction, handleCopyRedacted, confidenceThreshold, historyIndex, history, handleUndo, handleRedo, handleClearAll]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h2 className="text-3xl font-bold text-gray-800 mb-2">
            Text Redaction Tool
          </h2>
          <p className="text-gray-600">
            Enter your text to redact sensitive information automatically
          </p>
          {/* Confidence Threshold Slider */}
          <div className="mt-4 flex items-center gap-4">
            <label htmlFor="confidence-threshold" className="text-sm font-medium text-gray-700">
              Confidence Threshold:
            </label>
            <input
              id="confidence-threshold"
              type="range"
              min={SLIDER_MIN}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={confidenceThreshold}
              onChange={e => setConfidenceThreshold(Number(e.target.value))}
              className="w-48"
            />
            <span className="text-sm text-gray-800 font-semibold">
              {(confidenceThreshold * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {/* Error messages */}
        {(redactionError || restorationError) && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {redactionError || restorationError}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Left - Original Text Input */}
          <div className="h-[400px]">
            {/* Sample Text Dropdown */}
            <div className="mb-2 flex items-center gap-2">
              <label htmlFor="sample-text-select" className="text-sm font-medium text-gray-700">
                Load Sample Text:
              </label>
              <select
                id="sample-text-select"
                className="px-2 py-1 border rounded text-sm"
                defaultValue=""
                onChange={e => {
                  const idx = e.target.value;
                  if (idx !== "") {
                    setOriginalText(SAMPLE_TEXTS[Number(idx)].text);
                  }
                }}
              >
                <option value="">Select a sample...</option>
                {SAMPLE_TEXTS.map((sample, i) => (
                  <option key={sample.name} value={i}>{sample.name}</option>
                ))}
              </select>
            </div>
            <TextBox
              title="Original Text"
              content={originalText}
              onChange={handleOriginalTextChange}
              placeholder="Enter your text here..."
              loading={isRedacting}
            />
          </div>
          {isRedacting && originalText.length > 5000 && (
            <div className="text-sm text-gray-600 mt-2">
              Processing large text... This may take a moment.
            </div>
          )}

          {/* Top Right - Redacted Text Output */}
          <div className="h-[400px]">
            <TextBox
              title="Redacted Text"
              content={redactedText}
              readOnly={true}
              highlightRedactions={true}
              loading={isRedacting}
            />
            {redactedText && (
              <button
                onClick={handleCopyToLlm}
                className="mt-2 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
              >
                Copy to LLM Output →
              </button>
            )}
            {/* Redaction Summary Panel */}
            {currentTokensRef.current.length > 0 && (
              <div className="mt-4 p-3 bg-gray-50 rounded">
                <h4 className="font-semibold mb-2">Redaction Summary</h4>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(tokensByTypeCount(currentTokensRef.current)).map(([type, count]) => (
                    <span
                      key={type}
                      className={`px-2 py-1 rounded text-sm ${getPIITypeClass(type)}`}
                    >
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Bottom Left - Tokens JSON Output */}
          <div className="h-[400px]">
            <TextBox
              title="Redaction Tokens (JSON)"
              content={tokensJson}
              readOnly={true}
              highlightRedactions={true}
            />
            <div className="mt-4 flex gap-4">
              <button
                onClick={handleDownloadTokens}
                disabled={!tokensJson}
                className={`px-4 py-2 rounded bg-blue-500 text-white font-semibold hover:bg-blue-600 transition-colors text-sm ${!tokensJson ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Export Tokens
              </button>
              <button
                onClick={handleOpenFileDialog}
                className="px-4 py-2 rounded bg-green-500 text-white font-semibold hover:bg-green-600 transition-colors text-sm"
              >
                Import Tokens
              </button>
            </div>
          </div>

          {/* Bottom Right - LLM Output / Restored Text */}
          <div className="h-[400px]">
            <TextBox
              title="LLM Output (Paste redacted text here)"
              content={llmOutput}
              onChange={handleLlmOutputChange}
              placeholder="Paste the redacted text from LLM here to restore original values..."
              loading={isRestoring}
            />
            {restoredText && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
                <h4 className="font-semibold text-green-800 mb-1">Restored Text:</h4>
                <p className="text-green-700 whitespace-pre-wrap">{restoredText}</p>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-4 justify-center">
          <button
            onClick={handleUndo}
            disabled={historyIndex <= 0}
            className={`px-6 py-3 bg-yellow-500 text-white font-semibold rounded-lg hover:bg-yellow-600 transition-colors ${historyIndex <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={historyIndex >= history.length - 1}
            className={`px-6 py-3 bg-green-500 text-white font-semibold rounded-lg hover:bg-green-600 transition-colors ${historyIndex >= history.length - 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Redo
          </button>
          <button
            onClick={handleClearAll}
            className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
          >
            Clear All
          </button>
        </div>

        {/* Instructions */}
        <div className="mt-8 p-4 bg-blue-50 border border-blue-200 rounded">
          <h3 className="font-semibold text-blue-800 mb-2">How to use:</h3>
          <ol className="list-decimal list-inside text-blue-700 space-y-1">
            <li>Paste your text in the "Original Text" box</li>
            <li>The redacted version will automatically appear in the "Redacted Text" box</li>
            <li>Token mappings will be shown in JSON format for debugging</li>
            <li>Copy the redacted text to an LLM for processing</li>
            <li>Paste the LLM's output in the "LLM Output" box to restore original values</li>
          </ol>
        </div>
        {/* Hidden file input for importing tokens */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleImportTokens(file);
          }}
        />
      </main>
    </div>
  );
}
