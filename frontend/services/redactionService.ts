import axios from 'axios';

// Base URL for the API - will be configured from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
}

export interface RedactionResponse {
  redacted_text: string;
  tokens: BackendToken[];
}

export interface RestorationResponse {
  restored_text: string;
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
   * @returns Promise containing redacted text and tokens
   */
  async redactText(text: string): Promise<{ redactedText: string; tokens: RedactionToken[] }> {
    try {
      const response = await this.apiClient.post<RedactionResponse>('/redact', {
        text,
      });
      
      // Transform backend tokens to frontend format
      const tokens: RedactionToken[] = response.data.tokens.map((token, index) => ({
        id: index + 1,
        type: token.type,
        value: token.token,  // The redaction placeholder
        original: token.value,  // The original value
        position: token.start
      }));
      
      return {
        redactedText: response.data.redacted_text,
        tokens
      };
    } catch (error) {
      console.error('Error redacting text:', error);
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
          end: token.position + token.original.length
        })),
      });
      return response.data.restored_text;
    } catch (error) {
      console.error('Error restoring text:', error);
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
      console.error('API health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const redactionService = new RedactionService();

// Export default for convenience
export default redactionService;