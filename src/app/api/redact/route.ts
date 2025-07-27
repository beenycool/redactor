import { NextRequest, NextResponse } from 'next/server';
import { redactionTemplates } from '@/lib/templates';
import { detectPIIWithPatterns, ALL_PII_PATTERNS, detectContextPII, detectValidationPII } from '@/lib/patterns';
import { processTextWithLocalModel } from '@/lib/localModel';

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
  return detectContextPII(text);
}

function processCustomWordLists(text: string, alwaysRedactWords: string[], alwaysIgnoreWords: string[]): Entity[] {
  const entities: Entity[] = [];
  const ignoredRanges: Array<{start: number, end: number}> = [];
  
  // First, mark ranges to ignore
  for (const word of alwaysIgnoreWords) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      ignoredRanges.push({
        start: match.index,
        end: match.index + match[0].length
      });
    }
  }
  
  // Then, find words to always redact (excluding ignored ranges)
  for (const word of alwaysRedactWords) {
    const regex = new RegExp(word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let match;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      const end = match.index + match[0].length;
      
      // Check if this range overlaps with ignored ranges
      const isIgnored = ignoredRanges.some(range =>
        start < range.end && end > range.start
      );
      
      if (!isIgnored) {
        entities.push({
          entity_group: 'CUSTOM',
          word: match[0],
          start,
          end,
          score: 1.0 // High confidence for custom lists
        });
      }
    }
  }
  
  return entities;
}

// Fallback pattern validation
function validateWithPatterns(text: string): Entity[] {
  try {
    const entities = detectValidationPII(text);
    console.log(`Pattern validation found ${entities.length} potential PII entities`);
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
    const { text, template, confidenceThreshold = 0.7, alwaysRedactWords = [], alwaysIgnoreWords = [] } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }
    
    let entities: Entity[] = [];
    let processingMethod = 'local_models';
    
    // Process custom word lists first
    const customEntities = processCustomWordLists(text, alwaysRedactWords, alwaysIgnoreWords);
    entities.push(...customEntities);
    
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
            // Check if this match overlaps with custom entities or ignored words
            const start = match.index;
            const end = match.index + match[0].length;
            const isOverlapping = entities.some(entity =>
              start < entity.end && end > entity.start
            );
            
            if (!isOverlapping) {
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
    }
    
    // Use local models for PII detection
    // First, extract with patterns
    const patternEntities = await extractWithPatterns(text);
    entities.push(...patternEntities);
    
    // Use JavaScript-based local models (replaces Python servers)
    try {
      const localModelEntities = await processTextWithLocalModel(text);
      entities.push(...localModelEntities.map((entity: any) => ({
        entity_group: entity.entity_group || entity.label || 'MISC',
        word: entity.word || '',
        start: entity.start || 0,
        end: entity.end || 0,
        score: entity.score || 0.8
      })));
      processingMethod = 'local_js_models + patterns';
    } catch (error) {
      console.warn('Local JS model processing failed:', error);
      processingMethod = 'patterns only';
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
    
    // Filter entities based on confidence threshold
    const filteredEntities = uniqueEntities.filter(entity => entity.score >= confidenceThreshold);
    
    // Perform initial redaction
    let { redacted, mapping } = redactEntities(text, filteredEntities);
    
    // Apply pattern validation to catch any missed PII
    try {
      const validationEntities = validateWithPatterns(redacted);
      if (validationEntities.length > 0) {
        // Apply additional redactions
        const additionalRedaction = redactEntities(redacted, validationEntities);
        redacted = additionalRedaction.redacted;
        // Merge mappings
        mapping = { ...mapping, ...additionalRedaction.mapping };
      }
    } catch (error) {
      console.warn('Pattern validation failed:', error);
    }
    
    return NextResponse.json({
      redacted,
      mapping,
      method: processingMethod,
      entityCount: filteredEntities.length,
      totalEntities: uniqueEntities.length,
      entities: filteredEntities, // Return filtered entities for frontend highlighting
      confidenceThreshold,
      localModelsUsed: true
    });
  } catch (error: any) {
    console.error('Redaction error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}