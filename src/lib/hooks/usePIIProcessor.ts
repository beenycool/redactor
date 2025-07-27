import { useCallback, useEffect, useRef, useState } from 'react';
import { LocalRedactor } from '../localRedaction';
import { PIIEntity } from '../types';

interface ProcessingState {
  originalText: string;
  redactedText: string;
  entities: PIIEntity[];
  isProcessing: boolean;
  hasModels: boolean;
  confidenceThreshold: number;
  alwaysRedactWords: string[];
  alwaysIgnoreWords: string[];
}

export function usePIIProcessor() {
  const [state, setState] = useState<ProcessingState>({
    originalText: '',
    redactedText: '',
    entities: [],
    isProcessing: false,
    hasModels: false,
    confidenceThreshold: 0.7,
    alwaysRedactWords: [],
    alwaysIgnoreWords: []
  });

  const redactorRef = useRef<LocalRedactor>(new LocalRedactor());
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize model on mount
  useEffect(() => {
    const loadModels = async () => {
      setState(prev => ({ ...prev, isProcessing: true }));
      try {
        await redactorRef.current.initialize();
        setState(prev => ({ ...prev, hasModels: true }));
      } catch (error) {
        console.error('Failed to load models:', error);
      } finally {
        setState(prev => ({ ...prev, isProcessing: false }));
      }
    };

    loadModels();
  }, []);

  // Real-time redaction with debouncing
  useEffect(() => {
    if (!state.originalText.trim() || !state.hasModels || state.isProcessing) return;

    // Clear existing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }

    // Debounce processing
    processingTimeoutRef.current = setTimeout(async () => {
      setState(prev => ({ ...prev, isProcessing: true }));
      try {
        const result = await redactorRef.current.redact(
          state.originalText,
          state.confidenceThreshold,
          state.alwaysRedactWords,
          state.alwaysIgnoreWords
        );
        setState(prev => ({
          ...prev,
          redactedText: result.redactedText,
          entities: result.entities
        }));
      } catch (error) {
        console.error('Error processing text:', error);
      } finally {
        setState(prev => ({ ...prev, isProcessing: false }));
      }
    }, 500);

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [state.originalText, state.confidenceThreshold, state.alwaysRedactWords, state.alwaysIgnoreWords, state.hasModels]);

  const setText = useCallback((text: string) => {
    setState(prev => ({ ...prev, originalText: text }));
  }, []);

  const setConfidenceThreshold = useCallback((threshold: number) => {
    setState(prev => ({ ...prev, confidenceThreshold: threshold }));
  }, []);

  const setAlwaysRedactWords = useCallback((words: string[]) => {
    setState(prev => ({ ...prev, alwaysRedactWords: words }));
  }, []);

  const setAlwaysIgnoreWords = useCallback((words: string[]) => {
    setState(prev => ({ ...prev, alwaysIgnoreWords: words }));
  }, []);

  const manualRedact = useCallback(async () => {
    if (!state.originalText.trim() || !state.hasModels) return;

    setState(prev => ({ ...prev, isProcessing: true }));
    try {
      const result = await redactorRef.current.redact(
        state.originalText,
        state.confidenceThreshold,
        state.alwaysRedactWords,
        state.alwaysIgnoreWords
      );
      setState(prev => ({
        ...prev,
        redactedText: result.redactedText,
        entities: result.entities
      }));
    } catch (error) {
      console.error('Error processing text:', error);
    } finally {
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  }, [state.originalText, state.confidenceThreshold, state.alwaysRedactWords, state.alwaysIgnoreWords, state.hasModels]);

  return {
    originalText: state.originalText,
    redactedText: state.redactedText,
    entities: state.entities,
    isProcessing: state.isProcessing,
    hasModels: state.hasModels,
    confidenceThreshold: state.confidenceThreshold,
    alwaysRedactWords: state.alwaysRedactWords,
    alwaysIgnoreWords: state.alwaysIgnoreWords,
    setText,
    setConfidenceThreshold,
    setAlwaysRedactWords,
    setAlwaysIgnoreWords,
    manualRedact
  };
}
