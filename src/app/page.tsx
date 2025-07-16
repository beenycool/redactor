'use client';

import { useState } from 'react';

interface PIIMapping {
  [key: string]: string;
}

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [piiMapping, setPiiMapping] = useState<PIIMapping>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingType, setProcessingType] = useState<'remote' | 'local'>('remote');

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
    
    setIsProcessing(true);
    try {
      const result = processingType === 'remote' 
        ? await processWithRemoteAPI(originalText)
        : await processWithLocalModel(originalText);
      
      setRedactedText(result.redacted);
      setPiiMapping(result.mapping);
      setModifiedText(result.redacted);
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

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
          PII Redactor for Court & Psychiatric Reports
        </h1>
        
        <div className="mb-6 flex justify-center gap-4">
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Box 1: Original Input */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Original Report</h2>
              <button
                onClick={handleRedact}
                disabled={isProcessing || !originalText.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Processing...
                  </>
                ) : (
                  'Redact PII'
                )}
              </button>
            </div>
            <textarea
              value={originalText}
              onChange={(e) => setOriginalText(e.target.value)}
              placeholder="Paste your court report or psychiatric report here..."
              className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              disabled={isProcessing}
            />
          </div>

          {/* Box 2: Redacted Output */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Redacted Report</h2>
            <textarea
              value={redactedText}
              readOnly
              placeholder="Redacted text with PII placeholders will appear here..."
              className="w-full h-64 p-3 border border-gray-300 rounded-lg bg-gray-50 resize-none"
            />
          </div>

          {/* Box 3: Modified Text */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Modified Text</h2>
            <textarea
              value={modifiedText}
              onChange={(e) => setModifiedText(e.target.value)}
              placeholder="Edit the redacted text as needed..."
              className="w-full h-64 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Box 4: Restored Text */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Restored Report</h2>
              <button
                onClick={handleRestore}
                disabled={!modifiedText.trim() || Object.keys(piiMapping).length === 0}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Restore PII
              </button>
            </div>
            <textarea
              value={restoredText}
              readOnly
              placeholder="Restored text with original PII will appear here..."
              className="w-full h-64 p-3 border border-gray-300 rounded-lg bg-gray-50 resize-none"
            />
          </div>
        </div>

        {/* PII Mapping Display */}
        {Object.keys(piiMapping).length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow-md p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">PII Mapping</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(piiMapping).map(([placeholder, original]) => (
                <div key={placeholder} className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                  <span className="font-mono text-sm text-blue-600">{placeholder}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-sm text-gray-700">{original}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}