import { pipeline, env } from '@xenova/transformers';
import { splitTextIntoChunks, adjustEntityPositions, mergeEntities } from './textChunking';

// Configure transformers.js environment for browser
if (typeof window !== 'undefined') {
  // We're in the browser
  env.allowLocalModels = false;
  env.allowRemoteModels = true;
  // Use browser cache (IndexedDB)
  env.cacheDir = './.cache';
}

// Primary PII model - Piiranha is specialized for PII detection
const PRIMARY_PII_MODEL = 'iiiorg/piiranha-v1-detect-personal-information';

// Fallback model if Piiranha fails to load
const FALLBACK_MODEL = 'Xenova/bert-base-NER';

// Singleton pattern implementation for model caching
class LocalModelSingleton {
  private static instance: LocalModelSingleton;
  private model: any = null;
  private modelPromise: Promise<any> | null = null;
  private isInitialized: boolean = false;

  private constructor() {}

  static getInstance(): LocalModelSingleton {
    if (!LocalModelSingleton.instance) {
      LocalModelSingleton.instance = new LocalModelSingleton();
    }
    return LocalModelSingleton.instance;
  }

  async initializeModel() {
    // Return immediately if model is already loaded
    if (this.model) return this.model;
    if (this.modelPromise) return this.modelPromise;

    // Mark as initialized to prevent multiple initialization attempts
    if (this.isInitialized) {
      // Wait for existing promise to resolve
      return this.modelPromise;
    }

    this.isInitialized = true;

    this.modelPromise = (async () => {
      // Try to load the Piiranha model first (specialized for PII)
      try {
        console.log(`Attempting to load Piiranha PII model: ${PRIMARY_PII_MODEL}`);
        this.model = await pipeline('token-classification', PRIMARY_PII_MODEL, {
          dtype: 'q4', // 4-bit quantization for better performance
          local_files_only: false,
          progress_callback: (data: any) => {
            if (data.status === 'downloading') {
              console.log(`Downloading ${data.file}: ${Math.round(data.progress)}%`);
            }
          }
        } as any);
        console.log(`Piiranha PII model loaded successfully: ${PRIMARY_PII_MODEL}`);
        return this.model;
      } catch (error) {
        console.warn(`Failed to load Piiranha model ${PRIMARY_PII_MODEL}:`, error);
        
        // Fallback to general NER model
        try {
          console.log(`Attempting to load fallback BERT model: ${FALLBACK_MODEL}`);
          this.model = await pipeline('token-classification', FALLBACK_MODEL, {
            dtype: 'q4', // 4-bit quantization for better performance
            local_files_only: false,
            progress_callback: (data: any) => {
              if (data.status === 'downloading') {
                console.log(`Downloading ${data.file}: ${Math.round(data.progress)}%`);
              }
            }
          } as any);
          console.log(`Fallback BERT model loaded successfully: ${FALLBACK_MODEL}`);
          return this.model;
        } catch (fallbackError) {
          console.error(`Failed to load fallback model ${FALLBACK_MODEL}:`, fallbackError);
          this.isInitialized = false; // Reset initialization flag on failure
          throw new Error('Failed to load any local model');
        }
      }
    })();

    return this.modelPromise;
  }

  getModel() {
    return this.model;
  }

  isModelAvailable(): boolean {
    return this.model !== null;
  }
}

export async function initializeLocalModel() {
  const singleton = LocalModelSingleton.getInstance();
  return await singleton.initializeModel();
}

async function processTextWithModel(classifier: any, text: string) {
  // Split text into chunks for processing
  const chunks = splitTextIntoChunks(text);
  const allEntities: any[] = [];
  
  // Process each chunk
  for (const chunk of chunks) {
    try {
      const result = await classifier(chunk.text);
      
      if (!Array.isArray(result)) {
        throw new Error('Invalid model response format');
      }
      
      // Transform the result to match the expected format and adjust positions
      const entities = result.map((item: any) => {
        const obj = item as any;
        return {
          entity_group: String(obj.entity_group || obj.entity || 'MISC'),
          word: String(obj.word || ''),
          start: Number(obj.start || 0),
          end: Number(obj.end || 0),
          score: Number(obj.score || 0)
        };
      });
      
      // Adjust entity positions based on chunk offset
      const adjustedEntities = adjustEntityPositions(entities, chunk.startOffset);
      allEntities.push(...adjustedEntities);
    } catch (chunkError) {
      console.warn(`Error processing chunk starting at offset ${chunk.startOffset}:`, chunkError);
      // Continue processing other chunks
    }
  }
  
  return allEntities;
}

export async function processTextWithLocalModel(text: string) {
  try {
    // Initialize the model using singleton pattern
    const classifier = await initializeLocalModel();
    
    // Process text with the model
    console.log('Processing text with local model');
    const entities = await processTextWithModel(classifier, text);
    console.log(`Local model found ${entities.length} entities`);
    
    // If no entities found, try basic pattern matching
    if (entities.length === 0) {
      console.log('No entities found with ML model, trying basic pattern matching');
      return performBasicPIIDetection(text);
    }

    // Merge overlapping entities from different chunks
    const mergedEntities = mergeEntities(entities);
    
    return mergedEntities;
  } catch (error) {
    console.error('Local model processing error, falling back to basic detection:', error);
    return performBasicPIIDetection(text);
  }
}

function performBasicPIIDetection(text: string) {
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

  const results: any[] = [];
  
  patterns.forEach(({ label, pattern, entity_group }) => {
    let match;
    // Reset regex lastIndex to avoid issues with global flag
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      results.push({
        entity_group,
        label,
        score: 0.8,
        start: match.index,
        end: match.index + match[0].length,
        word: match[0]
      });
    }
  });

  return results;
}

export function isLocalModelAvailable(): boolean {
  const singleton = LocalModelSingleton.getInstance();
  return singleton.isModelAvailable();
}