import { HfInference } from '@huggingface/inference';

export interface SpanMarkerEntity {
  entity_group: string;
  word: string;
  start: number;
  end: number;
  score: number;
}

export interface SpanMarkerConfig {
  modelName?: string;
  timeout?: number;
  apiKey?: string;
}

export class SpanMarkerClient {
  private hf: HfInference;
  private modelName: string;
  private timeout: number;

  constructor(config: SpanMarkerConfig = {}) {
    const apiKey = config.apiKey || process.env.HF_TOKEN;
    if (!apiKey) {
      throw new Error('HuggingFace API token is required');
    }
    
    this.hf = new HfInference(apiKey);
    this.modelName = config.modelName || 'tomaarsen/span-marker-roberta-large-ontonotes5';
    this.timeout = config.timeout || 30000;
  }

  async extractEntities(text: string): Promise<SpanMarkerEntity[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const result = await this.hf.tokenClassification({
        model: this.modelName,
        inputs: text,
      });

      clearTimeout(timeoutId);

      // Validate and format the response
      if (!Array.isArray(result)) {
        throw new Error('Invalid response format from SpanMarker model');
      }

      // Group consecutive tokens and aggregate scores
      const entities = this.aggregateTokens(result as any[]);
      
      return entities.map(entity => ({
        entity_group: this.normalizeLabel(entity.entity_group),
        word: entity.word,
        start: entity.start,
        end: entity.end,
        score: entity.score
      }));

    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('SpanMarker API request timed out');
      }
      throw new Error(`SpanMarker API error: ${error.message}`);
    }
  }

  private aggregateTokens(tokens: any[]): SpanMarkerEntity[] {
    if (!tokens || tokens.length === 0) return [];

    const aggregated: SpanMarkerEntity[] = [];
    let currentEntity: any = null;

    for (const token of tokens) {
      const label = token.entity_group || token.entity || token.label;
      const word = token.word;
      const start = token.start;
      const end = token.end;
      const score = token.score;

      // Remove B- and I- prefixes if present
      const cleanLabel = label.replace(/^[BI]-/, '');

      if (!currentEntity || 
          currentEntity.entity_group !== cleanLabel || 
          start > currentEntity.end + 1) {
        // Start new entity
        if (currentEntity) {
          aggregated.push(currentEntity);
        }
        currentEntity = {
          entity_group: cleanLabel,
          word: word.replace(/^##/, ''), // Remove WordPiece prefix
          start: start,
          end: end,
          score: score
        };
      } else {
        // Continue current entity
        currentEntity.word += word.replace(/^##/, '');
        currentEntity.end = end;
        currentEntity.score = Math.max(currentEntity.score, score); // Take max confidence
      }
    }

    if (currentEntity) {
      aggregated.push(currentEntity);
    }

    return aggregated;
  }

  private normalizeLabel(label: string): string {
    // Map OntoNotes5 labels to our PII categories
    const labelMap: Record<string, string> = {
      'PERSON': 'PERSON',
      'PER': 'PERSON',
      'ORG': 'ORGANIZATION',
      'ORGANIZATION': 'ORGANIZATION',
      'GPE': 'LOCATION', // Geopolitical entities
      'LOC': 'LOCATION',
      'LOCATION': 'LOCATION',
      'DATE': 'DATE',
      'TIME': 'TIME',
      'MONEY': 'MONEY',
      'PERCENT': 'PERCENT',
      'CARDINAL': 'NUMBER',
      'ORDINAL': 'NUMBER',
      'QUANTITY': 'QUANTITY',
      'PRODUCT': 'PRODUCT',
      'EVENT': 'EVENT',
      'WORK_OF_ART': 'WORK_OF_ART',
      'LAW': 'LAW',
      'LANGUAGE': 'LANGUAGE',
      'NORP': 'NATIONALITY', // Nationalities, religious groups
      'FAC': 'FACILITY',
      'MISC': 'MISC'
    };

    const upperLabel = label.toUpperCase();
    return labelMap[upperLabel] || upperLabel;
  }

  // Check if the model is available
  async healthCheck(): Promise<boolean> {
    try {
      const testResult = await this.extractEntities("Test sentence with John Doe.");
      return Array.isArray(testResult);
    } catch {
      return false;
    }
  }
}

// Utility function to filter entities that are likely PII
export function filterPIIEntities(entities: SpanMarkerEntity[]): SpanMarkerEntity[] {
  const piiLabels = new Set([
    'PERSON', 'ORGANIZATION', 'LOCATION', 'GPE', 'DATE', 'TIME', 
    'MONEY', 'CARDINAL', 'ORDINAL', 'PHONE', 'EMAIL', 'ADDRESS'
  ]);

  return entities.filter(entity => 
    piiLabels.has(entity.entity_group.toUpperCase()) && 
    entity.score > 0.5 // Filter low-confidence entities
  );
}

// Create a singleton instance
let spanMarkerClient: SpanMarkerClient | null = null;

export function getSpanMarkerClient(): SpanMarkerClient | null {
  if (!spanMarkerClient) {
    try {
      spanMarkerClient = new SpanMarkerClient();
    } catch (error) {
      console.warn('Failed to initialize SpanMarker client:', error);
      return null;
    }
  }
  return spanMarkerClient;
}
