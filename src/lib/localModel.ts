import { pipeline, env } from '@xenova/transformers';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { splitTextIntoChunks, adjustEntityPositions, mergeEntities } from './textChunking';

// Ensure cache directory exists
const cacheDir = join(process.cwd(), 'models');
try {
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }
} catch (error) {
  console.warn('Failed to create cache directory, using default cache location:', error);
  // Module will continue to work with default cache location
}

// Configure transformers.js environment for Node.js server
env.allowLocalModels = true;

// For models that fail to load remotely, try to use local versions
const LOCAL_ONLY_MODELS = new Set([
    'iiiorg/piiranha-v1-detect-personal-information'
]);

let modelPromise: Promise<any> | null = null;
let modelLoadError: Error | null = null;

// Individual model instances for ensemble processing
let piiranhaModel: any = null;
let bertModel: any = null;
let piiranhaModelPromise: Promise<any> | null = null;
let bertModelPromise: Promise<any> | null = null;

// Alternative models that are publicly accessible
// Using multiple models for better PII detection coverage
const PII_MODELS = [
    'Xenova/bert-base-NER',
    'Xenova/distilbert-base-NER',
    'Xenova/bert-base-cased-finetuned-conll03-english' // CoNLL-03 trained
];

export async function initializeLocalModel() {
  // Try to initialize the piiranha model first (it's our primary PII model)
  const piiranhaModel = await initializePiiranhaModel().catch(() => null);
  
  // If piiranha model is available, return it
  if (piiranhaModel) {
    return piiranhaModel;
  }

  // Otherwise, try to initialize the BERT model as fallback
  const bertModel = await initializeBertModel().catch(() => null);
  
  if (bertModel) {
    return bertModel;
  }

  // If no models are available, throw an error
  throw new Error('Failed to initialize any local model');
}

export async function initializePiiranhaModel() {
  if (piiranhaModel) return piiranhaModel;
  if (piiranhaModelPromise) return piiranhaModelPromise;

  piiranhaModelPromise = (async () => {
    // Try to load the piiranha model only
    const piiranhaModelName = 'iiiorg/piiranha-v1-detect-personal-information';

    try {
      console.log(`Attempting to load Piiranha PII model: ${piiranhaModelName}`);
      piiranhaModel = await pipeline('token-classification', piiranhaModelName, {
        quantized: true,
        local_files_only: false,
        cache_dir: cacheDir,
        token: process.env.HF_TOKEN || undefined
      } as any);
      console.log(`Piiranha PII model loaded successfully: ${piiranhaModelName}`);
      return piiranhaModel;
    } catch (error) {
      console.warn(`Failed to load Piiranha model ${piiranhaModelName}:`, error);
      // If Piiranha model fails, return null so we can use BERT as fallback
      console.warn('Piiranha PII model failed to load, will use BERT model as fallback');
      return null;
    }
  })();

  return piiranhaModelPromise;
}

export async function initializeBertModel() {
  if (bertModel) return bertModel;
  if (bertModelPromise) return bertModelPromise;

  bertModelPromise = (async () => {
    const bertModelsToTry = PII_MODELS;

    for (const modelName of bertModelsToTry) {
      try {
        console.log(`Attempting to load BERT model: ${modelName}`);
        bertModel = await pipeline('token-classification', modelName, {
          quantized: true,
          local_files_only: false,
          cache_dir: cacheDir,
          revision: 'main',
          token: process.env.HF_TOKEN || undefined
        } as any);
        console.log(`BERT model loaded successfully: ${modelName}`);
        return bertModel;
      } catch (error) {
        console.warn(`Failed to load BERT model ${modelName}:`, error);
        // Continue to next model
      }
    }

    console.error('All BERT models failed to load');
    throw new Error('Failed to load any BERT model');
  })();

  return bertModelPromise;
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

function combineModelResults(piiranhaEntities: any[], bertEntities: any[]) {
  // Combine entities from both models
  const allEntities = [
    ...piiranhaEntities,
    ...bertEntities
  ];

  // Sort entities by start position
  const sortedEntities = [...allEntities].sort((a, b) => a.start - b.start);

  // Group entities by overlapping positions
  const groupedEntities: any[][] = [];
  let currentGroup: any[] = [];

  for (const entity of sortedEntities) {
    if (currentGroup.length === 0) {
      currentGroup.push(entity);
    } else {
      const lastEntity = currentGroup[currentGroup.length - 1];
      // Check if entities overlap (allow small gaps for partial matches)
      if (entity.start <= lastEntity.end + 2) {
        currentGroup.push(entity);
      } else {
        groupedEntities.push(currentGroup);
        currentGroup = [entity];
      }
    }
  }

  if (currentGroup.length > 0) {
    groupedEntities.push(currentGroup);
  }

  // For each group, intelligently combine results from both models
  const finalEntities = groupedEntities.map((group) => {
    if (group.length === 1) {
      return group[0];
    }

    // Prefer Piiranha model for PII-specific entities, BERT for general NER
    const piiSpecific = [
      'PERSON',
      'PER',
      'EMAIL',
      'PHONE',
      'ADDRESS',
      'ID'
    ];

    const piiranhaEntity = group.find((e) => piiranhaEntities.includes(e));
    const bertEntity = group.find((e) => bertEntities.includes(e));

    if (piiranhaEntity && bertEntity) {
      // If Piiranha found a PII-specific entity, prefer it
      if (piiSpecific.some((type) => piiranhaEntity.entity_group.toUpperCase().includes(type))) {
        return {
          ...piiranhaEntity,
          score: Math.max(piiranhaEntity.score, bertEntity.score * 0.8) // Boost score with confidence from both models
        };
      }

      // Otherwise, prefer the higher scoring entity but boost score
      const bestEntity = piiranhaEntity.score >= bertEntity.score ? piiranhaEntity : bertEntity;
      return {
        ...bestEntity,
        score: Math.min(1.0, bestEntity.score + 0.1) // Small boost for consensus
      };
    }

    // If only one model detected it, return the highest scoring entity
    return group.sort((a, b) => b.score - a.score)[0];
  });

  return finalEntities;
}

export async function processTextWithLocalModel(text: string) {
  try {
    // Initialize both models
    const [piiranhaClassifier, bertClassifier] = await Promise.all([
      initializePiiranhaModel().catch((error) => {
        console.warn('Failed to initialize Piiranha model:', error);
        return null;
      }),
      initializeBertModel().catch((error) => {
        console.warn('Failed to initialize BERT model:', error);
        return null;
      })
    ]);

    // If no models loaded, fall back to basic pattern matching
    if (!piiranhaClassifier && !bertClassifier) {
      console.log('No ML models available, using basic pattern matching');
      return performBasicPIIDetection(text);
    }

    let piiranhaEntities: any[] = [];
    let bertEntities: any[] = [];

    // Process with PII model if available
    if (piiranhaClassifier) {
      try {
        console.log('Processing text with PII model');
        piiranhaEntities = await processTextWithModel(piiranhaClassifier, text);
        console.log(`PII model found ${piiranhaEntities.length} entities`);
      } catch (error) {
        console.warn('Error processing text with PII model:', error);
      }
    } else {
      console.log('No PII model available, using BERT model only');
    }

    // Process with BERT model if available
    if (bertClassifier) {
      try {
        console.log('Processing text with BERT model');
        bertEntities = await processTextWithModel(bertClassifier, text);
        console.log(`BERT model found ${bertEntities.length} entities`);
      } catch (error) {
        console.warn('Error processing text with BERT model:', error);
      }
    }

    let allEntities: any[] = [];

    // If both models are available, combine their results
    if (piiranhaClassifier && bertClassifier) {
      console.log('Combining results from both models');
      allEntities = combineModelResults(piiranhaEntities, bertEntities);
    } else {
      // Use results from whichever model is available
      allEntities = [
        ...piiranhaEntities,
        ...bertEntities
      ];
    }

    // If no entities found with ML models, try basic pattern matching
    if (allEntities.length === 0) {
      console.log('No entities found with ML models, trying basic pattern matching');
      allEntities = performBasicPIIDetection(text);
    }

    // Merge overlapping entities from different chunks
    const mergedEntities = mergeEntities(allEntities);
    
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
  return piiranhaModel !== null || bertModel !== null;
}