import { pipeline, env } from '@xenova/transformers';

// Configure transformers.js environment
env.allowLocalModels = true;
env.allowRemoteModels = true;

let tokenClassifier: unknown = null;

export async function initializeLocalModel() {
  if (tokenClassifier) return tokenClassifier;
  
  try {
    console.log('Loading local PII detection model...');
    tokenClassifier = await pipeline(
      'token-classification',
      'iiiorg/piiranha-v1-detect-personal-information',
      {
        quantized: true,
        local_files_only: false,
        cache_dir: './models'
      }
    );
    console.log('Local model loaded successfully');
    return tokenClassifier;
  } catch (error) {
    console.error('Failed to load local model:', error);
    throw error;
  }
}

export async function processTextWithLocalModel(text: string) {
  try {
    const classifier = await initializeLocalModel();
    const result = await (classifier as (text: string) => Promise<unknown[]>)(text);
    
    // Transform the result to match the expected format
    const entities = result.map((item: unknown) => {
      const obj = item as Record<string, unknown>;
      return {
        entity_group: String(obj.entity_group || obj.entity || 'MISC'),
        word: String(obj.word || ''),
        start: Number(obj.start || 0),
        end: Number(obj.end || 0),
        score: Number(obj.score || 0)
      };
    });
    
    return entities;
  } catch (error) {
    console.error('Local model processing error:', error);
    throw error;
  }
}

export function isLocalModelAvailable(): boolean {
  return tokenClassifier !== null;
}