export interface SmolLM3Response {
  prompt: string;
  response: string;
  tokens_used: number;
}

export interface SmolLM3Config {
  baseUrl: string;
  timeout?: number;
}

export interface ValidationResponse {
  request_id: number;
  ner_missed_entities: Array<{
    text: string;
    label: string;
    start: number;
    end: number;
    confidence: number;
    model: string;
  }>;
  smol_missed_entities: Array<{
    text: string;
    type: string;
    start: number;
    confidence: number;
  }>;
  total_missed: number;
  validation_time: number;
  needs_further_redaction: boolean;
}

export interface EntityExtractionResponse {
  request_id: number;
  entities: Array<{
    text: string;
    label: string;
    start: number;
    end: number;
    confidence: number;
    model: string;
  }>;
  entity_count: number;
  extraction_time: number;
}

export class SmolLM3Client {
  private baseUrl: string;
  private timeout: number;

  constructor(config: SmolLM3Config) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt: string): Promise<SmolLM3Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SmolLM3 API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.response || typeof data.response !== 'string') {
        throw new Error('Invalid response format from SmolLM3 API');
      }

      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SmolLM3 API request timed out');
      }
      throw error;
    }
  }

  async validateRedaction(originalText: string, redactedText: string): Promise<ValidationResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/validate-redaction`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          original_text: originalText, 
          redacted_text: redactedText 
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SmolLM3 validation error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SmolLM3 validation request timed out');
      }
      throw error;
    }
  }

  async extractEntities(text: string): Promise<EntityExtractionResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}/extract-entities`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`SmolLM3 entity extraction error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('SmolLM3 entity extraction request timed out');
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(this.baseUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }
}

// PII detection prompts for SmolLM3
export const PII_DETECTION_PROMPTS = {
  detect: (text: string) => `Analyze the following text and identify any personally identifiable information (PII). 
Return a JSON array of objects with the format: [{"entity": "text", "type": "PERSON|EMAIL|PHONE|ADDRESS|SSN|CREDIT_CARD|ORGANIZATION|LOCATION", "start": character_start, "end": character_end, "confidence": 0.0-1.0}]

Text: ${text}

JSON response:`,
  
  validate: (text: string) => `Check if this redacted text still contains any personally identifiable information (PII). 
Return a JSON array of objects with the format: [{"entity": "text", "type": "PERSON|EMAIL|PHONE|ADDRESS|SSN|CREDIT_CARD|ORGANIZATION|LOCATION", "start": character_start, "end": character_end, "confidence": 0.0-1.0}]
If no PII is found, return an empty array [].

Text: ${text}

JSON response:`,
  
  redact: (text: string) => `Redact all personally identifiable information (PII) from this text by replacing it with appropriate placeholders like <PII PERSON>, <PII EMAIL>, etc.
Return only the redacted text, nothing else.

Text: ${text}

Redacted text:`,
};

export function parseSmolLM3Response(response: string): Array<{
  entity: string;
  type: string;
  start: number;
  end: number;
  confidence: number;
}> {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.map(item => ({
          entity: String(item.entity || item.word || ''),
          type: String(item.type || item.entity_group || 'MISC'),
          start: Number(item.start || 0),
          end: Number(item.end || 0),
          confidence: Number(item.confidence || item.score || 0.8)
        }));
      }
    }
    
    // If no JSON found, return empty array
    return [];
  } catch (error) {
    console.warn('Failed to parse SmolLM3 response:', error);
    return [];
  }
}