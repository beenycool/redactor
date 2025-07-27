import { PIIEntity, RedactionResult } from './types';
import { splitTextIntoChunks, adjustEntityPositions, mergeEntities } from './textChunking';

export class LocalRedactor {
  private modelLoaded: boolean = false;
  private modelInitializing: boolean = false;
  private worker: Worker | null = null;

  async initialize(): Promise<void> {
    if (this.modelLoaded || this.modelInitializing) return;
    
    this.modelInitializing = true;
    try {
      // Try to initialize with web worker first
      if (typeof Worker !== 'undefined') {
        try {
          await this.initializeWorker();
          console.log('Successfully initialized with web worker');
        } catch (workerError) {
          console.warn('Worker initialization failed, falling back to direct processing:', workerError);
          await this.initializeDirect();
        }
      } else {
        // No worker support, use direct processing
        console.log('Web Workers not supported, using direct processing');
        await this.initializeDirect();
      }
      
      this.modelLoaded = true;
    } catch (error) {
      console.error('Failed to initialize local model:', error);
      throw error;
    } finally {
      this.modelInitializing = false;
    }
  }

  private async initializeWorker(): Promise<void> {
    this.worker = new Worker('/worker.js');
    
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        reject(new Error('Failed to create worker'));
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error('Worker initialization timeout (60s)'));
      }, 60000);

      const messageHandler = (e: MessageEvent) => {
        const { type, error } = e.data;
        if (type === 'initialized') {
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', messageHandler);
          this.worker?.removeEventListener('error', errorHandler);
          resolve();
        } else if (type === 'error') {
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', messageHandler);
          this.worker?.removeEventListener('error', errorHandler);
          reject(new Error(error || 'Worker initialization failed'));
        }
      };

      const errorHandler = (error: ErrorEvent) => {
        clearTimeout(timeout);
        this.worker?.removeEventListener('message', messageHandler);
        this.worker?.removeEventListener('error', errorHandler);
        reject(new Error(`Worker error: ${error.message}`));
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.addEventListener('error', errorHandler);

      // Start initialization
      this.worker.postMessage({ type: 'initialize' });
    });
  }

  private async initializeDirect(): Promise<void> {
    // Fallback to direct processing
    const { processTextWithLocalModel } = await import('./localModel');
    // Test with a small sample to ensure model loads
    await processTextWithLocalModel('test initialization');
    console.log('Direct processing initialized successfully');
  }

  async redact(
    text: string, 
    confidenceThreshold: number = 0.7,
    alwaysRedactWords: string[] = [],
    alwaysIgnoreWords: string[] = []
  ): Promise<RedactionResult> {
    if (!this.modelLoaded) {
      throw new Error("Model not initialized");
    }
    
    let entities: PIIEntity[];
    
    try {
      // Use worker if available, otherwise fallback to direct processing
      if (this.worker) {
        entities = await this.processWithWorker(text);
      } else {
        // Fallback to direct processing
        const { processTextWithLocalModel } = await import('./localModel');
        entities = await processTextWithLocalModel(text);
      }
    } catch (error) {
      console.warn('Processing failed, attempting fallback:', error);
      // If worker fails, try direct processing as final fallback
      if (this.worker) {
        try {
          const { processTextWithLocalModel } = await import('./localModel');
          entities = await processTextWithLocalModel(text);
        } catch (fallbackError) {
          console.error('All processing methods failed:', fallbackError);
          // Return basic pattern matching as last resort
          entities = this.performBasicPIIDetection(text);
        }
      } else {
        // Return basic pattern matching as last resort
        entities = this.performBasicPIIDetection(text);
      }
    }
    
    return this.applyRedaction(text, entities, confidenceThreshold, alwaysRedactWords, alwaysIgnoreWords);
  }

  private async processWithWorker(text: string): Promise<PIIEntity[]> {
    if (!this.worker) throw new Error('Worker not available');

    const chunks = splitTextIntoChunks(text);
    const allEntities: PIIEntity[] = [];

    // Process chunks in parallel using the worker
    const promises = chunks.map((chunk, index) => {
      return new Promise<PIIEntity[]>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker processing timeout for chunk ${index}`));
        }, 30000);

        const messageHandler = (e: MessageEvent) => {
          const { type, chunkIndex, entities, error } = e.data;
          
          if (chunkIndex !== index) return; // Not our chunk
          
          clearTimeout(timeout);
          this.worker?.removeEventListener('message', messageHandler);
          
          if (type === 'results') {
            try {
              // Adjust entity positions based on chunk offset
              const adjustedEntities = adjustEntityPositions(entities || [], chunk.startOffset);
              resolve(adjustedEntities);
            } catch (adjustError) {
              console.warn(`Error adjusting entities for chunk ${index}:`, adjustError);
              resolve([]); // Return empty array instead of failing
            }
          } else if (type === 'error') {
            reject(new Error(error || `Processing error for chunk ${index}`));
          }
        };

        if (!this.worker) {
          reject(new Error('Worker became null'));
          return;
        }

        this.worker.addEventListener('message', messageHandler);
        this.worker.postMessage({
          type: 'process',
          text: chunk.text,
          chunkIndex: index
        });
      });
    });

    try {
      const results = await Promise.all(promises);
      results.forEach(entities => allEntities.push(...entities));
      return mergeEntities(allEntities);
    } catch (error) {
      console.error('Worker processing failed:', error);
      throw error;
    }
  }

  private applyRedaction(
    text: string, 
    entities: PIIEntity[], 
    threshold: number,
    alwaysRedactWords: string[],
    alwaysIgnoreWords: string[]
  ): RedactionResult {
    // Filter entities by confidence threshold
    let filteredEntities = entities.filter(entity => entity.score >= threshold);

    // Add always redact words
    const alwaysRedactEntities = this.findAlwaysRedactWords(text, alwaysRedactWords);
    filteredEntities = [...filteredEntities, ...alwaysRedactEntities];

    // Remove always ignore words
    filteredEntities = filteredEntities.filter(entity => 
      !alwaysIgnoreWords.some(ignoreWord => 
        entity.word.toLowerCase().includes(ignoreWord.toLowerCase())
      )
    );

    // Sort entities by start position
    filteredEntities.sort((a, b) => a.start - b.start);

    // Apply redaction
    let redactedText = text;
    let offset = 0;
    const piiMapping: Record<string, string> = {};

    for (const entity of filteredEntities) {
      const originalWord = entity.word;
      const placeholder = this.generatePlaceholder(entity.entity_group, originalWord);
      
      // Store mapping for restoration
      piiMapping[placeholder] = originalWord;

      // Apply redaction with offset adjustment
      const start = entity.start + offset;
      const end = entity.end + offset;
      
      redactedText = redactedText.substring(0, start) + 
                    placeholder + 
                    redactedText.substring(end);
      
      // Update offset for next replacement
      offset += placeholder.length - (entity.end - entity.start);
    }

    return {
      redactedText,
      entities: filteredEntities,
      restoredText: this.restoreText(redactedText, piiMapping),
      piiMapping
    };
  }

  private findAlwaysRedactWords(text: string, alwaysRedactWords: string[]): PIIEntity[] {
    const entities: PIIEntity[] = [];
    
    for (const word of alwaysRedactWords) {
      const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let match;
      
      while ((match = regex.exec(text)) !== null) {
        entities.push({
          entity_group: 'CUSTOM',
          word: match[0],
          start: match.index,
          end: match.index + match[0].length,
          score: 1.0
        });
      }
    }
    
    return entities;
  }

  private generatePlaceholder(entityType: string, originalWord: string): string {
    const placeholders: Record<string, string> = {
      'PERSON': '[PERSON]',
      'ORGANIZATION': '[ORG]',
      'LOCATION': '[LOCATION]',
      'DATE': '[DATE]',
      'EMAIL': '[EMAIL]',
      'PHONE': '[PHONE]',
      'CREDIT_CARD': '[CARD]',
      'SSN': '[SSN]',
      'CUSTOM': '[REDACTED]'
    };
    
    return placeholders[entityType] || '[PII]';
  }

  private restoreText(redactedText: string, piiMapping: Record<string, string>): string {
    let restoredText = redactedText;
    
    for (const [placeholder, originalValue] of Object.entries(piiMapping)) {
      restoredText = restoredText.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), originalValue);
    }
    
    return restoredText;
  }

  private performBasicPIIDetection(text: string): PIIEntity[] {
    const patterns = [
      {
        label: 'EMAIL',
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
        entity_group: 'EMAIL'
      },
      {
        label: 'PHONE',
        pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
        entity_group: 'PHONE'
      },
      {
        label: 'SSN',
        pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
        entity_group: 'SSN'
      },
      {
        label: 'CREDIT_CARD',
        pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
        entity_group: 'CREDIT_CARD'
      },
      {
        label: 'PERSON',
        pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
        entity_group: 'PERSON'
      }
    ];

    const results: PIIEntity[] = [];
    
    patterns.forEach(({ label, pattern, entity_group }) => {
      let match;
      // Reset regex lastIndex to avoid issues with global flag
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        results.push({
          entity_group,
          score: 0.8,
          start: match.index,
          end: match.index + match[0].length,
          word: match[0]
        });
      }
    });

    return results;
  }

  isReady(): boolean {
    return this.modelLoaded;
  }

  isInitializing(): boolean {
    return this.modelInitializing;
  }

  cleanup(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.modelLoaded = false;
  }
}
