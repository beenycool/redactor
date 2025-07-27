export interface PIIEntity {
  word: string;
  score: number;
  entity_group: string;
  start: number;
  end: number;
}

export interface RedactionResult {
  redactedText: string;
  restoredText: string;
  entities: PIIEntity[];
  piiMapping?: Record<string, string>;
}

export interface RedactionOptions {
  text: string;
  confidenceThreshold: number;
  alwaysRedactWords: string[];
  alwaysIgnoreWords: string[];
  smolLM3Url: string;
  useLocalProcessing: boolean;
}