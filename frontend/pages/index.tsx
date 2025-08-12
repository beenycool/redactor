import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import TextBox from '../components/TextBox';
import { redactionService, RedactionToken, enhancedRedactionService } from '../services/redactionService';
import { tokensToJson, parseTokensFromJson, tokensByTypeCount } from '../utils/tokenUtils';
import { getPIITypeClass } from '../components/PIIBadge';

const SLIDER_MIN = 0.0;
const SLIDER_MAX = 1.0;
const SLIDER_STEP = 0.01;
const DEFAULT_CONFIDENCE = 0.5;

// Maximum history size to prevent memory issues
const MAX_HISTORY_SIZE = 100;


export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [tokensJson, setTokensJson] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [llmOutput, setLlmOutput] = useState('');
  // Confidence threshold state
  const [confidenceThreshold, setConfidenceThreshold] = useState(DEFAULT_CONFIDENCE);

  // Qwen integration state
  const [qwenUrl, setQwenUrl] = useState('');
  const [useQwen, setUseQwen] = useState(false);
  const [useConsistency, setUseConsistency] = useState(true);
  const [isConnectingQwen, setIsConnectingQwen] = useState(false);

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
      let finalHistory = updated;
      if (updated.length > MAX_HISTORY_SIZE) {
        // Remove oldest entries
        finalHistory = updated.slice(updated.length - MAX_HISTORY_SIZE);
      }
      
      return finalHistory;
    });
    
    // Update historyIndex synchronously based on the actual new history length
    setHistoryIndex(prev => {
      const newIndex = Math.max(0, (historyIndex >= 0 ? historyIndex + 1 : 0));
      return newIndex;
    });
  }, [historyIndex]);

  // Undo handler
  const handleUndo = useCallback(() => {
    setHistoryIndex(currentIndex => {
      if (currentIndex > 0) {
        const prevState = history[currentIndex - 1];
        setOriginalText(prevState.originalText);
        setRedactedText(prevState.redactedText);
        setTokensJson(prevState.tokensJson);
        currentTokensRef.current = prevState.tokens;
        return currentIndex - 1;
      }
      return currentIndex;
    });
  }, [history]);

  // Redo handler
  const handleRedo = useCallback(() => {
    setHistoryIndex(currentIndex => {
      if (currentIndex < history.length - 1) {
        const nextState = history[currentIndex + 1];
        setOriginalText(nextState.originalText);
        setRedactedText(nextState.redactedText);
        setTokensJson(nextState.tokensJson);
        currentTokensRef.current = nextState.tokens;
        return currentIndex + 1;
      }
      return currentIndex;
    });
  }, [history]);

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
          let result;
          
          // Use enhanced service if Qwen or consistency features are enabled
          if (useQwen || useConsistency) {
            result = await enhancedRedactionService.redactTextEnhanced(
              text, 
              threshold, 
              useQwen, 
              useConsistency
            );
          } else {
            // Use basic service
            result = await redactionService.redactText(text, threshold);
          }
          
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
      [confidenceThreshold, pushHistory, useQwen, useConsistency]
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

  // Qwen connection handler
  const handleConnectQwen = async () => {
    setIsConnectingQwen(true);
    try {
      // Test connection
      const response = await fetch(`${qwenUrl}/health`);
      if (response.ok) {
        enhancedRedactionService.setQwenUrl(qwenUrl);
        setUseQwen(true);
        showToast('Connected to Qwen service!');
      } else {
        showToast('Failed to connect to Qwen service');
      }
    } catch (error) {
      showToast('Invalid URL or service not running');
    } finally {
      setIsConnectingQwen(false);
    }
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
    }, [originalText, performRedaction, handleCopyRedacted, confidenceThreshold, handleUndo, handleRedo, handleClearAll]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="mb-6">
{/* Qwen Integration and Options */}
<div className="mt-4 space-y-4">
  {/* Qwen Integration */}
  <div className="flex items-center gap-4">
    <label className="text-sm font-medium text-gray-700">
      Qwen Double-Check:
    </label>
    <input
      type="text"
      placeholder="Paste ngrok URL from Colab"
      value={qwenUrl}
      onChange={(e) => setQwenUrl(e.target.value)}
      className="flex-1 px-3 py-1 border rounded"
    />
    <button
      onClick={handleConnectQwen}
      disabled={!qwenUrl || isConnectingQwen}
      className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
    >
      {isConnectingQwen ? 'Connecting...' : 'Connect'}
    </button>
    {useQwen && (
      <span className="text-green-600 text-sm">✓ Connected</span>
    )}
  </div>
  
  {/* Options */}
  <div className="flex items-center gap-6">
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={useConsistency}
        onChange={(e) => setUseConsistency(e.target.checked)}
        className="rounded"
      />
      <span className="text-sm text-gray-700">
        Consistent Name Redaction
      </span>
    </label>
    
    <label className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={useQwen}
        onChange={(e) => setUseQwen(e.target.checked)}
        disabled={!qwenUrl}
        className="rounded"
      />
      <span className="text-sm text-gray-700">
        Use Qwen Double-Check
      </span>
    </label>
  </div>
</div>
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
        )}r

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Left - Original Text Input */}
          <div className="h-[400px]">
            {/* Sample Text Dropdown */}
            <div className="mb-3">
              <label htmlFor="sample-text" className="block text-sm font-medium text-gray-700 mb-2">
                Sample Text:
              </label>
              <select
                id="sample-text"
                onChange={(e) => {
                  const samples = {
                    'court-report': 'John Doe appeared before Judge Smith on Case No. 2024-CR-1234. His SSN is 123-45-6789 and he lives at 123 Main Street, Anytown, CA 90210. Contact: john.doe@email.com or (555) 123-4567.',
                    'medical-record': 'Patient Sarah Johnson, DOB: 03/15/1985, was admitted on 12/01/2024. Medical Record #MR-2024-001. Insurance: Blue Cross #BC123456789. Emergency contact: Mike Johnson, (555) 987-6543.',
                    'financial-document': 'Account holder: Robert Wilson, Account #1234-5678-9012-3456. Transaction date: 11/30/2024. Amount: $1,250.00. Routing number: 021000021. Tax ID: 12-3456789.',
                    'custom': ''
                  };
                  const selected = e.target.value;
                  if (selected !== 'custom') {
                    setOriginalText(samples[selected as keyof typeof samples]);
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="custom">Select sample text...</option>
                <option value="court-report">Court Report Example</option>
                <option value="medical-record">Medical Record Example</option>
                <option value="financial-document">Financial Document Example</option>
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
            {/* Copy to LLM button */}
            {redactedText && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setLlmOutput(redactedText);
                    performRestoration(redactedText);
                  }}
                  className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                >
                  Copy to LLM Input
                </button>
              </div>
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

          {/* Bottom Left - Redacted Text Input for LLM */}
          <div className="h-[400px]">
            <TextBox
              title="Redacted Text (Paste for LLM)"
              content={llmOutput}
              onChange={handleLlmOutputChange}
              placeholder="Paste the redacted text here to send to LLM..."
              loading={isRestoring}
            />
          </div>

          {/* Bottom Right - Restored Text Output */}
          <div className="h-[400px]">
            <TextBox
              title="Restored Text"
              content={restoredText}
              readOnly={true}
              loading={isRestoring}
            />
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
