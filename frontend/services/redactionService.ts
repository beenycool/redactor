import axios from 'axios';
import type { AxiosError } from 'axios';

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
function logAxiosError(error: AxiosError, context: string): void {
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
  private apiClient = axios.create({
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
      if (error instanceof AxiosError || (error && (error as any).isAxiosError === true)) {
        logAxiosError(error as AxiosError, 'redactText');
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
      if (error instanceof AxiosError || (error && (error as any).isAxiosError === true)) {
        logAxiosError(error as AxiosError, 'restoreText');
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
      if (error instanceof AxiosError || (error && (error as any).isAxiosError === true)) {
        logAxiosError(error as AxiosError, 'checkHealth');
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
  
  /**
   * Set the Qwen service URL from Google Colab
   */
  setQwenUrl(url: string) {
    this.qwenUrl = url;
    localStorage.setItem('qwen_url', url);
  }
  
  /**
   * Get stored Qwen URL
   */
  getQwenUrl(): string | null {
    if (!this.qwenUrl) {
      this.qwenUrl = localStorage.getItem('qwen_url');
    }
    return this.qwenUrl;
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
    // First pass with local Piiranha model
    const firstPass = await this.redactText(text, confidenceThreshold);
    
    // Build name consistency map
    if (consistentNames) {
      this.buildNameConsistencyMap(firstPass.tokens);
      firstPass.tokens = this.applyNameConsistency(text, firstPass.tokens);
    }
    
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
      
      if (qwenCheck && qwenCheck.additional_redactions.length > 0) {
        // Merge additional redactions
        const additionalTokens = qwenCheck.additional_redactions.map((r, idx) => ({
          id: firstPass.tokens.length + idx + 1,
          type: r.type,
          value: `<PII_${r.type}_${idx + 1}>`,
          original: r.value,
          position: r.start,
          end: r.end
        }));
        
        firstPass.tokens = [...firstPass.tokens, ...additionalTokens];
        
        // Re-apply redactions to get final text
        let finalText = text;
        const sortedTokens = [...firstPass.tokens].sort((a, b) => b.position - a.position);
        for (const token of sortedTokens) {
          const before = finalText.substring(0, token.position);
          const after = finalText.substring(token.position + token.original.length);
          finalText = before + token.value + after;
        }
        
        return {
          redactedText: finalText,
          tokens: firstPass.tokens
        };
      }
    }
    
    return firstPass;
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
    
    return [...tokens, ...additionalTokens];
  }
}

export const enhancedRedactionService = new EnhancedRedactionService();
// --- End Enhanced Qwen Redaction Service ---