import axios from 'axios';

// Local narrow type guard (compatible with older axios type defs in this project)
function isAxiosErrorLike(err: any): err is { response?: any; config?: any; message: string } {
  return !!err && typeof err === 'object' && 'message' in err && ('config' in err || 'response' in err);
}

// Base URL for the API - will be configured from environment variables
const API_BASE_URL =
  (typeof process !== 'undefined' && (process as any).env && (process as any).env.NEXT_PUBLIC_API_URL)
    ? (process as any).env.NEXT_PUBLIC_API_URL
    : 'http://localhost:8000';
const DEBUG =
  (typeof process !== 'undefined' && (process as any).env && ((process as any).env.NEXT_PUBLIC_DEBUG === 'true' || (process as any).env.NODE_ENV === 'development'))
    ? true
    : false;

// Type definitions for API responses
export interface BackendToken {
  token: string;
  value: string;
  type: string;
  start: number;
  end: number;
}

export interface RedactionToken {
  id: number;
  type: string;
  value: string;  // The redaction token (e.g., <PII_PERSON_1>)
  original: string;  // The original value
  position: number;
  end: number;
}

export interface RedactionResponse {
  redacted_text: string;
  tokens: BackendToken[];
}

export interface RestorationResponse {
  restored_text: string;
}

// Helper function for logging axios errors
function logAxiosError(error: any, context: string): void {
  if (!DEBUG) return;
  
  console.error(`[${context}] Axios error:`, {
    message: error.message,
    status: error.response?.status,
    statusText: error.response?.statusText,
    url: error.config?.url,
    method: error.config?.method,
    responseData: error.response?.data,
    requestData: error.config?.data
  });
}

// Service class for redaction operations
class RedactionService {
  protected apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
      'Content-Type': 'application/json',
    },
    timeout: 30000, // 30 seconds timeout
  });

  /**
   * Redact sensitive information from text
   * @param text - The original text to redact
   * @param confidenceThreshold - Minimum confidence threshold for PII detection (0.0–1.0)
   * @returns Promise containing redacted text and tokens
   */
  async redactText(
    text: string,
    confidenceThreshold?: number
  ): Promise<{ redactedText: string; tokens: RedactionToken[] }> {
    try {
      const payload: Record<string, any> = { text };
      if (typeof confidenceThreshold === 'number') {
        payload.confidence_threshold = confidenceThreshold;
      }
      const response = await this.apiClient.post<RedactionResponse>('/redact', payload);

      // Transform backend tokens to frontend format
      const tokens: RedactionToken[] = response.data.tokens.map((token: BackendToken, index: number) => {
        return {
          id: index + 1,
          type: token.type,
          value: token.token,  // The redaction placeholder (e.g., <PII_PERSON_1>)
          original: token.value,  // The original value
          position: token.start,
          end: token.end
        };
      });

      return {
        redactedText: response.data.redacted_text,
        tokens
      };
    } catch (error) {
  if (isAxiosErrorLike(error)) {
        logAxiosError(error, 'redactText');
      } else {
        console.error('Error redacting text:', error);
      }
      throw new Error('Failed to redact text. Please try again.');
    }
  }

  /**
   * Restore redacted text using tokens
   * @param redactedText - The redacted text
   * @param tokens - The tokens containing original values
   * @returns Promise containing restored text
   */
  async restoreText(redactedText: string, tokens: RedactionToken[]): Promise<string> {
    try {
      const response = await this.apiClient.post<RestorationResponse>('/restore', {
        redacted_text: redactedText,
        tokens: tokens.map(token => ({
          token: token.value,
          value: token.original,
          type: token.type,
          start: token.position,
          end: token.end
        })),
      });
      return response.data.restored_text;
    } catch (error) {
  if (isAxiosErrorLike(error)) {
        logAxiosError(error, 'restoreText');
      } else {
        console.error('Error restoring text:', error);
      }
      throw new Error('Failed to restore text. Please try again.');
    }
  }

  /**
   * Health check for the API
   * @returns Promise indicating if API is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await this.apiClient.get('/health');
      return response.status === 200;
    } catch (error) {
  if (isAxiosErrorLike(error)) {
        logAxiosError(error, 'checkHealth');
      } else {
        console.error('API health check failed:', error);
      }
      return false;
    }
  }
}

// Export singleton instance
export const redactionService = new RedactionService();

// Export default for convenience
export default redactionService;
// --- Enhanced Qwen Redaction Service ---

export interface QwenCheckRequest {
  text: string;
  chunk_size?: number;
  existing_redactions?: BackendToken[];
}

export interface QwenCheckResponse {
  additional_redactions: Array<{
    value: string;
    type: string;
    start: number;
    end: number;
    confidence: number;
  }>;
  reasoning: string;
  confidence: number;
}

class EnhancedRedactionService extends RedactionService {
  private qwenUrl: string | null = null;
  private consistentNames: Map<string, string> = new Map();
  private typeCountCache: Record<string, number> = {};
  private remoteTypeMap: Record<string,string> | null = null;
  
  /**
   * Set the Qwen service URL from Google Colab
   */
  setQwenUrl(url: string) {
    this.qwenUrl = url;
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('qwen_url', url);
      } catch {
        /* ignore storage errors */
      }
    }
  }
  
  /**
   * Get stored Qwen URL
   */
  getQwenUrl(): string | null {
    if (!this.qwenUrl && typeof window !== 'undefined') {
      try {
        this.qwenUrl = localStorage.getItem('qwen_url');
      } catch {
        /* ignore */
      }
    }
    return this.qwenUrl;
  }

  /**
   * Dedupe tokens so each placeholder appears exactly once (first occurrence retained)
   */
  private dedupeTokensByValue(tokens: RedactionToken[]): RedactionToken[] {
    // Detect collisions: same placeholder value but different originals
    const map: Record<string, RedactionToken> = {};
    const collisions: Array<{ value: string; originals: Set<string> }> = [];
    for (const t of tokens) {
      if (!map[t.value]) {
        map[t.value] = t;
      } else if (map[t.value].original !== t.original) {
        // Collision - different originals share same placeholder -> keep first, reassign new placeholder to later one
        const set = new Set([map[t.value].original, t.original]);
        collisions.push({ value: t.value, originals: set });
      }
    }
    if (collisions.length) {
      // Rebuild type counts before reassigning
      this.buildTypeCountCache(Object.values(map));
      for (const t of tokens) {
        const collision = collisions.find(c => c.value === t.value && !Object.is(map[t.value], t) && c.originals.has(t.original));
        if (collision) {
          // Assign a fresh placeholder to eliminate collision
            const newTypeMatch = t.value.match(/^<PII_([A-Z0-9_]+)_\d+>$/);
            const type = newTypeMatch ? newTypeMatch[1] : t.type;
            const newPlaceholder = this.nextPlaceholder(type);
            t.value = newPlaceholder;
        }
      }
    }
    // Remove any duplicate placeholder entries (first occurrence kept)
    const seen = new Set<string>();
    const result: RedactionToken[] = [];
    for (const t of tokens) {
      if (!seen.has(t.value)) {
        seen.add(t.value);
        result.push(t);
      }
    }
    return result;
  }

  /**
   * Rebuild redacted text from original text + token spans.
   * Assumes token positions & end indices reference the ORIGINAL text.
   */
  private rebuildRedacted(text: string, tokens: RedactionToken[]): string {
    if (!tokens.length) return text;
  const sorted = [...tokens].sort((a,b) => a.position - b.position);
    let out = '';
    let cursor = 0;
    for (const tok of sorted) {
      if (tok.position < cursor) {
    // Attempt minimal recovery: adjust start to current cursor if within token span, else skip
    if (tok.end <= cursor) continue;
    // annotate conflict by wrapping original placeholder once
    out += tok.value;
    cursor = Math.max(cursor, tok.end);
    continue;
      }
      out += text.slice(cursor, tok.position) + tok.value;
      cursor = tok.end;
    }
    out += text.slice(cursor);
    return out;
  }

  /**
   * Build type count cache from existing tokens to ensure unique sequential numbering.
   */
  private buildTypeCountCache(tokens: RedactionToken[]) {
    this.typeCountCache = {};
    const re = /^<PII_([A-Z0-9_]+)_(\d+)>$/;
    for (const t of tokens) {
      const m = t.value.match(re);
      if (m) {
        const type = m[1];
        const num = parseInt(m[2], 10) || 0;
        this.typeCountCache[type] = Math.max(this.typeCountCache[type] || 0, num);
      }
    }
  }

  /**
   * Generate a new unique placeholder for a canonical type.
   */
  private nextPlaceholder(type: string): string {
    const t = type.toUpperCase();
    const current = this.typeCountCache[t] || 0;
    const next = current + 1;
    this.typeCountCache[t] = next;
    return `<PII_${t}_${next}>`;
  }

  /**
   * Canonicalize raw types (aligning with backend mapping subset).
   */
  private canonicalType(raw: string): string {
  const r = raw.toUpperCase();
  if (this.remoteTypeMap) return this.remoteTypeMap[r] || r;
  return r;
  }
  
  /**
   * Double-check with Qwen model for additional PII
   */
  async doubleCheckWithQwen(
    text: string,
    existingTokens: BackendToken[]
  ): Promise<QwenCheckResponse | null> {
    const url = this.getQwenUrl();
    if (!url) return null;
    
    try {
      const response = await axios.post<QwenCheckResponse>(
        `${url}/check_pii`,
        {
          text, // Send original text, not redacted text
          chunk_size: 500,
          existing_redactions: existingTokens
        },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('Qwen check failed:', error);
      return null;
    }
  }
  
  /**
   * Enhanced redact with consistent name handling and Qwen double-check
   */
  async redactTextEnhanced(
    text: string,
    confidenceThreshold: number = 0.5,
    useQwen: boolean = true,
    consistentNames: boolean = true
  ): Promise<{ redactedText: string; tokens: RedactionToken[] }> {
    // Lazy-load remote type mapping
    if (!this.remoteTypeMap) {
      try {
        const resp = await this.apiClient.get<{ mapping?: Record<string,string> }>('/type-mappings');
        if (resp.data?.mapping) {
          this.remoteTypeMap = resp.data.mapping;
        }
      } catch {/* ignore mapping load errors */}
    }
    // First pass with local Piiranha model
    const firstPass = await this.redactText(text, confidenceThreshold);
    // Build name consistency map + apply if requested
    if (consistentNames) {
      this.buildNameConsistencyMap(firstPass.tokens);
      firstPass.tokens = this.applyNameConsistency(text, firstPass.tokens);
      // Remove duplicate placeholder mappings (restore needs 1:1)
      firstPass.tokens = this.dedupeTokensByValue(firstPass.tokens);
      // Rebuild redacted text to reflect consistency substitutions
      (firstPass as any).redactedText = this.rebuildRedacted(text, firstPass.tokens);
    }

    // Ensure type count cache reflects (possibly deduped) tokens
    this.buildTypeCountCache(firstPass.tokens);
    
    // Second pass with Qwen if available
    if (useQwen && this.getQwenUrl()) {
      const qwenCheck = await this.doubleCheckWithQwen(
        text, // Pass original text, not redacted text
        firstPass.tokens.map(t => ({
          token: t.value,
          value: t.original,
          type: t.type,
          start: t.position,
          end: t.end
        }))
      );
      
  if (qwenCheck && Array.isArray(qwenCheck.additional_redactions) && qwenCheck.additional_redactions.length > 0) {
        // Build a fast overlap index of existing spans
        const existingSpans = firstPass.tokens.map(t => ({start: t.position, end: t.end}));
        
        const additionalTokens: RedactionToken[] = [];
        for (const r of qwenCheck.additional_redactions) {
          const cType = this.canonicalType(r.type);
          // Skip if overlaps any existing token
          const overlaps = existingSpans.some(s => r.start < s.end && r.end > s.start);
          if (overlaps) continue;
          const placeholder = this.nextPlaceholder(cType);
            additionalTokens.push({
              id: firstPass.tokens.length + additionalTokens.length + 1,
              type: cType,
              value: placeholder,
              original: r.value,
              position: r.start,
              end: r.end
            });
          existingSpans.push({start: r.start, end: r.end});
        }
  if (additionalTokens.length) {
          firstPass.tokens = this.dedupeTokensByValue([...firstPass.tokens, ...additionalTokens]);
          (firstPass as any).redactedText = this.rebuildRedacted(text, firstPass.tokens);
          return {
            redactedText: (firstPass as any).redactedText,
            tokens: firstPass.tokens
          };
        }
      }
    }
    
    // Ensure redactedText is present (firstPass.redactedText already from base service)
    return firstPass as { redactedText: string; tokens: RedactionToken[] };
  }
  
  /**
   * Build consistency map for names (e.g., all "Smith" instances)
   */
  private buildNameConsistencyMap(tokens: RedactionToken[]) {
    this.consistentNames.clear();
    
    // Group tokens by type
    const nameTokens = tokens.filter(t => 
      t.type === 'PERSON' || t.type === 'NAME' || t.type === 'SURNAME'
    );
    
    // Map each unique name to its first token
    for (const token of nameTokens) {
      const nameParts = token.original.split(/\s+/);
      for (const part of nameParts) {
        const normalized = part.toLowerCase();
        if (!this.consistentNames.has(normalized)) {
          this.consistentNames.set(normalized, token.value);
        }
      }
    }
  }
  
  /**
   * Apply name consistency throughout the text
   */
  private applyNameConsistency(text: string, tokens: RedactionToken[]): RedactionToken[] {
    const additionalTokens: RedactionToken[] = [];
    let tokenId = tokens.length + 1;
    
    // Search for all instances of mapped names
  for (const [name, tokenValue] of this.consistentNames) {
      const regex = new RegExp(`\\b${name}\\b`, 'gi');
      let match: RegExpExecArray | null;
      
      while ((match = regex.exec(text)) !== null) {
        if (match && typeof match.index === 'number') {
          // Check if this position is already covered
          let alreadyCovered = false;
          for (const t of tokens) {
            if (match.index >= t.position && match.index < t.position + t.original.length) {
              alreadyCovered = true;
              break;
            }
          }
          if (!alreadyCovered) {
            additionalTokens.push({
              id: tokenId++,
              type: 'PERSON_CONSISTENT',
              value: tokenValue,
              original: match[0],
              position: match.index,
              end: match.index + match[0].length
            });
          }
        }
      }
    }
    
  // Intentionally return tokens + consistency tokens (later dedup + rebuild will resolve duplicates)
  return [...tokens, ...additionalTokens];
  }
}

export const enhancedRedactionService = new EnhancedRedactionService();
// --- End Enhanced Qwen Redaction Service ---