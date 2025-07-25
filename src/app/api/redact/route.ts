import { NextRequest, NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';
import { processTextWithLocalModel, initializeLocalModel } from '@/lib/localModel';
import { redactionTemplates } from '@/lib/templates';
import { detectPIIWithPatterns, CONTEXT_PII_PATTERNS, VALIDATION_PII_PATTERNS } from '@/lib/patterns';

// Initialize HuggingFace client
const hf = process.env.HF_TOKEN ? new HfInference(process.env.HF_TOKEN) : null;

interface Entity {
  entity_group: string;
  word: string;
  start: number;
  end: number;
  score: number;
}

function validateEntities(data: any): Entity[] {
  if (!Array.isArray(data)) {
    throw new Error('Invalid API response: expected array of entities');
  }

  return data.map((item: any) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('Invalid entity: expected object');
    }

    if (typeof item.entity_group !== 'string' ||
        typeof item.word !== 'string' ||
        typeof item.start !== 'number' ||
        typeof item.end !== 'number' ||
        typeof item.score !== 'number') {
      throw new Error(`Invalid entity structure: ${JSON.stringify(item)}`);
    }

    return {
      entity_group: item.entity_group,
      word: item.word,
      start: item.start,
      end: item.end,
      score: item.score
    };
  });
}

async function extractWithPatterns(text: string): Promise<Entity[]> {
  return detectPIIWithPatterns(text, CONTEXT_PII_PATTERNS);
}

async function processWithHuggingFace(text: string): Promise<Entity[]> {
  if (!hf) {
    throw new Error('HuggingFace token not configured');
  }
  
  try {
    const result = await hf.tokenClassification({
      model: 'iiiorg/piiranha-v1-detect-personal-information',
      inputs: text,
    });
    
    return validateEntities(result);
  } catch (error: any) {
    // If the model fails, try alternative models
    const alternativeModels = [
      'dslim/bert-base-NER',
      'Davlan/bert-base-multilingual-cased-ner-hrl',
      'Jean-Baptiste/roberta-large-ner-english'
    ];
    
    for (const model of alternativeModels) {
      try {
        const result = await hf.tokenClassification({
          model,
          inputs: text,
        });
        return validateEntities(result);
      } catch {
        // Continue to next model
      }
    }
    
    throw new Error('All HuggingFace models failed');
  }
}

// New function to validate redacted text using patterns (replaces SmolLM3 validation)
function validateWithPatterns(text: string): Entity[] {
  try {
    // Detect any PII that remains in supposedly redacted text
    const entities = detectPIIWithPatterns(text, VALIDATION_PII_PATTERNS);
    console.log(`Validation found ${entities.length} potential PII entities`);
    return entities;
  } catch (error) {
    console.warn('Pattern validation failed:', error);
    return [];
  }
}

function normalizeEntityType(type: string): string {
  const typeMap: Record<string, string> = {
    'PER': 'PERSON',
    'PERSON': 'PERSON',
    'PERSON_NAME': 'PERSON',
    'FULL_NAME': 'PERSON',
    'PERSON_TITLE': 'PERSON',
    'PERSON_ROLE': 'PERSON',
    'PATIENT': 'PERSON',
    'PARTY': 'PERSON',
    'ORG': 'ORGANIZATION',
    'ORGANIZATION': 'ORGANIZATION',
    'LOC': 'LOCATION',
    'LOCATION': 'LOCATION',
    'DATE': 'DATE',
    'TIME': 'TIME',
    'MISC': 'MISC',
    'EMAIL': 'EMAIL',
    'PHONE': 'PHONE',
    'PHONE_NUMBER': 'PHONE',
    'ADDRESS': 'ADDRESS',
    'SSN': 'SSN',
    'CREDIT_CARD': 'CREDIT_CARD',
    'IP_ADDRESS': 'IP_ADDRESS',
    'MEDICATION': 'MEDICATION',
    'DIAGNOSIS': 'DIAGNOSIS',
    'CASE_NUMBER': 'CASE_NUMBER',
    'ID_NUMBER': 'ID_NUMBER',
    'ACCOUNT_NUMBER': 'ACCOUNT_NUMBER'
  };
  
  return typeMap[type.toUpperCase()] || type.toUpperCase();
}

function redactEntities(text: string, entities: Entity[]): { redacted: string, mapping: Record<string, string> } {
  let redacted = text;
  const mapping: Record<string, string> = {};
  const entityCounts: Record<string, number> = {};
  
  // Sort entities by start position in reverse order
  const sortedEntities = [...entities].sort((a, b) => b.start - a.start);
  
  for (const entity of sortedEntities) {
    const normalizedType = normalizeEntityType(entity.entity_group);
    entityCounts[normalizedType] = (entityCounts[normalizedType] || 0) + 1;
    const placeholder = `<PII ${normalizedType} ${entityCounts[normalizedType]}>`;
    
    mapping[placeholder] = entity.word;
    redacted = redacted.slice(0, entity.start) + placeholder + redacted.slice(entity.end);
  }
  
  return { redacted, mapping };
}

export async function POST(request: NextRequest) {
  try {
    const { text, type = 'auto', template } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    
    let entities: Entity[] = [];
    let processingMethod = type;
    
    // Apply template-specific patterns if provided
    if (template && redactionTemplates[template]) {
      const templatePatterns = redactionTemplates[template].patterns;
      for (const { pattern, category } of templatePatterns) {
        // Create a new RegExp instance to avoid modifying frozen regex objects
        const regex = new RegExp(pattern.source, pattern.flags);
        regex.lastIndex = 0;
        const matches = Array.from(text.matchAll(regex)) as RegExpMatchArray[];
        for (const match of matches) {
          if (match.index !== undefined) {
            entities.push({
              entity_group: category,
              word: match[0],
              start: match.index,
              end: match.index + match[0].length,
              score: 0.9
            });
          }
        }
      }
    }
    
    // Process based on type
    if (type === 'remote' || type === 'auto') {
      try {
        const hfEntities = await processWithHuggingFace(text);
        entities.push(...hfEntities);
        processingMethod = 'remote';
      } catch (error) {
        console.warn('Remote processing failed:', error);
        if (type === 'remote') {
          // If explicitly remote, try pattern extraction as fallback
          const patternEntities = await extractWithPatterns(text);
          entities.push(...patternEntities);
          processingMethod = 'pattern';
        } else {
          // For 'auto' type, fallback to local processing
          processingMethod = 'local';
        }
      }
    }
    
    if (type === 'local' || (type === 'auto' && processingMethod !== 'remote')) {
      try {
        await initializeLocalModel();
        const localEntities = await processTextWithLocalModel(text);
        entities.push(...localEntities);
        processingMethod = 'local';
      } catch (error) {
        console.warn('Local processing failed:', error);
        // Fall back to pattern extraction
        const patternEntities = await extractWithPatterns(text);
        entities.push(...patternEntities);
        processingMethod = 'pattern';
      }
    }
    
    // If no entities found yet, use pattern extraction
    if (entities.length === 0) {
      entities = await extractWithPatterns(text);
      processingMethod = 'pattern';
    }
    
    // Remove duplicates and merge overlapping entities
    // Simplified approach: sort by start position, then iterate and keep highest scoring entities
    const uniqueEntities = (() => {
      if (entities.length === 0) return [];
      
      // Sort entities by start position
      const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
      const result: Entity[] = [];
      
      for (const entity of sortedEntities) {
        // Check if this entity overlaps with the last one in result
        if (result.length > 0) {
          const lastEntity = result[result.length - 1];
          // Check for overlap: entities overlap if one starts before the other ends
          if (entity.start < lastEntity.end) {
            // Overlap detected - keep the entity with higher score
            if (entity.score > lastEntity.score) {
              result[result.length - 1] = entity;
            }
            // If current entity has lower or equal score, we keep the existing one (do nothing)
          } else {
            // No overlap - add the entity
            result.push(entity);
          }
        } else {
          // First entity - always add
          result.push(entity);
        }
      }
      
      return result;
    })();
    
    // Perform initial redaction
    let { redacted, mapping } = redactEntities(text, uniqueEntities);
    
    // Apply pattern-based validation to catch any missed PII
    const validationEntities = validateWithPatterns(redacted);
    if (validationEntities.length > 0) {
      // Apply additional redactions
      const additionalRedaction = redactEntities(redacted, validationEntities);
      redacted = additionalRedaction.redacted;
      // Merge mappings
      mapping = { ...mapping, ...additionalRedaction.mapping };
    }
    
    return NextResponse.json({
      redacted,
      mapping,
      method: processingMethod,
      entityCount: uniqueEntities.length
    });
  } catch (error: any) {
    console.error('Redaction error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}