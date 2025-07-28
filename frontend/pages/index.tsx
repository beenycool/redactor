import React, { useState, useCallback, useRef, useEffect } from 'react';
import TextBox from '../components/TextBox';
import { redactionService, RedactionToken } from '../services/redactionService';
import { tokensToJson, parseTokensFromJson } from '../utils/tokenUtils';

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [tokensJson, setTokensJson] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [llmOutput, setLlmOutput] = useState('');
  
  // Loading states
  const [isRedacting, setIsRedacting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  // Error states
  const [redactionError, setRedactionError] = useState('');
  const [restorationError, setRestorationError] = useState('');
  
  // Store tokens for restoration
  const currentTokensRef = useRef<RedactionToken[]>([]);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced redaction function
  const performRedaction = useCallback(async (text: string) => {
    if (!text.trim()) {
      setRedactedText('');
      setTokensJson('');
      currentTokensRef.current = [];
      return;
    }

    setIsRedacting(true);
    setRedactionError('');
    
    try {
      const result = await redactionService.redactText(text);
      setRedactedText(result.redactedText);
      currentTokensRef.current = result.tokens;
      setTokensJson(tokensToJson(result.tokens, true));
    } catch (error) {
      setRedactionError(error instanceof Error ? error.message : 'Failed to redact text');
      console.error('Redaction error:', error);
    } finally {
      setIsRedacting(false);
    }
  }, []);

  // Debounced handler for original text changes
  const handleOriginalTextChange = useCallback((text: string) => {
    setOriginalText(text);
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for debounced API call
    debounceTimerRef.current = setTimeout(() => {
      performRedaction(text);
    }, 500); // 500ms debounce delay
  }, [performRedaction]);

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
    
    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    
    // Set new timer for debounced API call
    debounceTimerRef.current = setTimeout(() => {
      performRestoration(text);
    }, 500); // 500ms debounce delay
  }, [performRestoration]);

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
  };

  // Copy redacted text to LLM output box
  const handleCopyToLlm = () => {
    setLlmOutput(redactedText);
    performRestoration(redactedText);
  };

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
            <TextBox
              title="Original Text"
              content={originalText}
              onChange={handleOriginalTextChange}
              placeholder="Enter your text here..."
              loading={isRedacting}
            />
          </div>

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
          </div>

          {/* Bottom Left - Tokens JSON Output */}
          <div className="h-[400px]">
            <TextBox
              title="Redaction Tokens (JSON)"
              content={tokensJson}
              readOnly={true}
              highlightRedactions={true}
            />
          </div>

          {/* Bottom Right - LLM Output / Restored Text */}
          <div className="h-[400px]">
            <div className="mb-2">
              <TextBox
                title="LLM Output (Paste redacted text here)"
                content={llmOutput}
                onChange={handleLlmOutputChange}
                placeholder="Paste the redacted text from LLM here to restore original values..."
                loading={isRestoring}
              />
            </div>
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
      </main>
    </div>
  );
}
