'use client';

import { useState, useEffect } from 'react';
import { sessionManager } from '@/lib/session';
import { restorePII } from '@/lib/fileUpload';
import { Header } from '@/components/Header';
import { ProcessingToggle } from '@/components/ProcessingToggle';
import { EditorGrid } from '@/components/EditorGrid';

export default function Home() {
  const [originalText, setOriginalText] = useState('');
  const [redactedText, setRedactedText] = useState('');
  const [modifiedText, setModifiedText] = useState('');
  const [restoredText, setRestoredText] = useState('');
  const [piiMapping, setPiiMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingType, setProcessingType] = useState<'remote' | 'local'>('remote');

  // Load saved session on component mount
  useEffect(() => {
    const savedSession = sessionManager.load();
    if (savedSession) {
      setOriginalText(savedSession.originalText);
      setRedactedText(savedSession.redactedText);
      setModifiedText(savedSession.modifiedText);
      setPiiMapping(savedSession.piiMapping);
      
      // Restore text from modified text and mapping
      if (savedSession.modifiedText && Object.keys(savedSession.piiMapping).length > 0) {
        const restored = restorePII(savedSession.modifiedText, savedSession.piiMapping);
        setRestoredText(restored);
      }
    }
  }, []);

  const handleRedact = async () => {
    if (!originalText.trim()) return;
    
    setIsProcessing(true);
    
    try {
      const response = await fetch('/api/redact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: originalText, type: processingType }),
      });
      
      const result = await response.json();
      
      // Validate that result is an object and contains expected properties
      if (typeof result !== 'object' || result === null) {
        throw new Error('Invalid API response: expected object');
      }
      
      // Check if required properties exist
      if (!('redacted' in result) || !('mapping' in result)) {
        console.error('API response missing required properties:', result);
        alert('Error: Invalid response from server. Please try again.');
        return;
      }
      
      // Validate property types
      if (typeof result.redacted !== 'string' || typeof result.mapping !== 'object') {
        console.error('API response has invalid property types:', result);
        alert('Error: Invalid response from server. Please try again.');
        return;
      }
      
      setRedactedText(result.redacted);
      setModifiedText(result.redacted);
      setPiiMapping(result.mapping);
      setRestoredText('');
    
      sessionManager.save({
        originalText,
        redactedText: result.redacted,
        modifiedText: result.redacted,
        piiMapping: result.mapping,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Processing error:', error);
      alert('Error processing text. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRestore = () => {
    if (modifiedText && Object.keys(piiMapping).length > 0) {
      const restored = restorePII(modifiedText, piiMapping);
      setRestoredText(restored);
      
      // Save session with updated modified text
      const savedSession = sessionManager.load();
      if (savedSession) {
        sessionManager.save({
          ...savedSession,
          modifiedText
        });
      }
    }
  };

  const handleClear = () => {
    setOriginalText('');
    setRedactedText('');
    setModifiedText('');
    setRestoredText('');
    setPiiMapping({});
    sessionManager.clear();
  };

  // Update restored text when modified text changes
  useEffect(() => {
    if (modifiedText && Object.keys(piiMapping).length > 0) {
      const restored = restorePII(modifiedText, piiMapping);
      setRestoredText(restored);
    }
  }, [modifiedText, piiMapping]);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Header onClear={handleClear} />
        
        <ProcessingToggle 
          processingType={processingType} 
          setProcessingType={setProcessingType} 
        />
        
        <EditorGrid
          originalText={originalText}
          setOriginalText={setOriginalText}
          redactedText={redactedText}
          modifiedText={modifiedText}
          setModifiedText={setModifiedText}
          restoredText={restoredText}
          onRedact={handleRedact}
          onRestore={handleRestore}
          isProcessing={isProcessing}
          isRedactDisabled={!originalText.trim()}
          isRestoreDisabled={!modifiedText.trim() || Object.keys(piiMapping).length === 0}
        />
      </div>
    </div>
  );
}