import { NextRequest, NextResponse } from 'next/server';
import { HfInference } from '@huggingface/inference';

interface PIIEntity {
  entity_group: string;
  word: string;
  start: number;
  end: number;
  score: number;
}

interface PIIMapping {
  [key: string]: string;
}

// Specialized PII categories for court/psychiatric reports
const PII_CATEGORIES = {
  'PER': 'PERSON',
  'PERSON': 'PERSON',
  'NAME': 'PERSON',
  'ORG': 'ORGANIZATION',
  'ORGANIZATION': 'ORGANIZATION',
  'LOC': 'LOCATION',
  'LOCATION': 'LOCATION',
  'MISC': 'MISC',
  'DATE': 'DATE',
  'TIME': 'TIME',
  'PHONE': 'PHONE',
  'EMAIL': 'EMAIL',
  'ADDRESS': 'ADDRESS',
  'ID': 'ID_NUMBER',
  'CASE': 'CASE_NUMBER',
  'DOCKET': 'DOCKET_NUMBER',
  'MEDICATION': 'MEDICATION',
  'DIAGNOSIS': 'DIAGNOSIS',
  'DOCTOR': 'DOCTOR',
  'JUDGE': 'JUDGE',
  'COURT': 'COURT',
  'HOSPITAL': 'HOSPITAL'
};

// Context-aware patterns for court/psychiatric reports
const CONTEXT_PATTERNS = [
  { pattern: /\b(?:judge|hon\.?|honorable)\s+([a-z\s]+)/gi, category: 'JUDGE' },
  { pattern: /\b(?:dr\.?|doctor)\s+([a-z\s]+)/gi, category: 'DOCTOR' },
  { pattern: /\b(?:case|docket)\s*(?:no\.?|number)?\s*:?\s*([a-z0-9\-]+)/gi, category: 'CASE_NUMBER' },
  { pattern: /\b(?:patient|client|defendant|plaintiff)\s+([a-z\s]+)/gi, category: 'PERSON' },
  { pattern: /\b(?:medication|drug|prescription)\s*:?\s*([a-z\s]+)/gi, category: 'MEDICATION' },
  { pattern: /\b(?:diagnosed|diagnosis)\s*:?\s*([a-z\s]+)/gi, category: 'DIAGNOSIS' },
  { pattern: /\b(?:court|courthouse)\s+([a-z\s]+)/gi, category: 'COURT' },
  { pattern: /\b(?:hospital|clinic|facility)\s+([a-z\s]+)/gi, category: 'HOSPITAL' },
  { pattern: /\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/g, category: 'DATE' },
  { pattern: /\b\d{3}[\-\.\s]?\d{3}[\-\.\s]?\d{4}\b/g, category: 'PHONE' },
  { pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g, category: 'EMAIL' },
  { pattern: /\b\d+\s+[a-zA-Z\s]+(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|place|pl)\b/gi, category: 'ADDRESS' }
];

function extractPIIWithContext(text: string): { entities: PIIEntity[], mapping: PIIMapping } {
  const entities: PIIEntity[] = [];
  const mapping: PIIMapping = {};
  const categoryCounts: { [key: string]: number } = {};
  
  // Apply context-aware patterns
  CONTEXT_PATTERNS.forEach(({ pattern, category }) => {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      
      // Count occurrences of each category
      categoryCounts[category] = (categoryCounts[category] || 0) + 1;
      const placeholder = `<PII ${category} ${categoryCounts[category]}>`;
      
      entities.push({
        entity_group: category,
        word: match[0],
        start,
        end,
        score: 0.9 // High confidence for pattern matches
      });
      
      mapping[placeholder] = match[0];
    }
  });
  
  return { entities, mapping };
}

function processWithRemoteAPI(text: string, hfToken: string) {
  const hf = new HfInference(hfToken);
  
  return hf.tokenClassification({
    model: 'iiiorg/piiranha-v1-detect-personal-information',
    inputs: text,
  });
}

async function processWithLocalModel(text: string) {
  try {
    // Try to use the local model with @xenova/transformers
    const { processTextWithLocalModel } = await import('@/lib/localModel');
    const entities = await processTextWithLocalModel(text);
    return { entities, mapping: {} };
  } catch (error) {
    console.error('Local model processing error, falling back to context patterns:', error);
    // Fall back to context-aware extraction
    const { entities, mapping } = extractPIIWithContext(text);
    return { entities, mapping };
  }
}

function redactText(text: string, entities: PIIEntity[], existingMapping: PIIMapping = {}): { redacted: string, mapping: PIIMapping } {
  const mapping = { ...existingMapping };
  const categoryCounts: { [key: string]: number } = {};
  let redacted = text;
  
  // Sort entities by start position in reverse order to maintain indices
  const sortedEntities = [...entities].sort((a, b) => b.start - a.start);
  
  sortedEntities.forEach(entity => {
    const category = PII_CATEGORIES[entity.entity_group.toUpperCase() as keyof typeof PII_CATEGORIES] || 'MISC';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
    
    const placeholder = `<PII ${category} ${categoryCounts[category]}>`;
    mapping[placeholder] = entity.word;
    
    redacted = redacted.slice(0, entity.start) + placeholder + redacted.slice(entity.end);
  });
  
  return { redacted, mapping };
}

export async function POST(request: NextRequest) {
  try {
    const { text, type } = await request.json();
    
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'Invalid text input' }, { status: 400 });
    }
    
    let entities: PIIEntity[] = [];
    let contextMapping: PIIMapping = {};
    
    if (type === 'remote') {
      const hfToken = process.env.HF_TOKEN;
      if (!hfToken) {
        return NextResponse.json({ error: 'HF_TOKEN not configured' }, { status: 500 });
      }
      
      try {
        const result = await processWithRemoteAPI(text, hfToken);
        entities = Array.isArray(result) ? result.map(item => ({
          entity_group: item.entity_group || item.entity || 'MISC',
          word: item.word,
          start: item.start,
          end: item.end,
          score: item.score
        })) : [];
      } catch (error) {
        console.error('Remote API error:', error);
        // Fall back to context-aware extraction
        const contextResult = extractPIIWithContext(text);
        entities = contextResult.entities;
        contextMapping = contextResult.mapping;
      }
    } else {
      // Local processing
      const localResult = await processWithLocalModel(text);
      entities = localResult.entities;
      contextMapping = localResult.mapping;
    }
    
    // Combine API results with context-aware extraction
    const combinedResult = extractPIIWithContext(text);
    const allEntities = [...entities, ...combinedResult.entities];
    
    // Remove duplicates based on overlapping positions
    const uniqueEntities = allEntities.filter((entity, index, arr) => {
      return !arr.some((other, otherIndex) => {
        if (index >= otherIndex) return false;
        return (entity.start >= other.start && entity.start < other.end) ||
               (entity.end > other.start && entity.end <= other.end);
      });
    });
    
    const { redacted, mapping } = redactText(text, uniqueEntities, contextMapping);
    
    return NextResponse.json({
      redacted,
      mapping,
      entities: uniqueEntities,
      processingType: type
    });
    
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}