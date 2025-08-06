import axios, { AxiosError } from 'axios';

// Base URL for the API - will be configured from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const DEBUG = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV === 'development';

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

      // Log the raw response for debugging
      console.log('Raw backend response:', response.data);

      // Transform backend tokens to frontend format
      const tokens: RedactionToken[] = response.data.tokens.map((token, index) => {
        // Log each token transformation
        console.log(`Mapping token ${index}:`, {
          backend_token: token.token,
          backend_value: token.value,
          backend_type: token.type
        });

        return {
          id: index + 1,
          type: token.type,
          value: token.token,  // The redaction placeholder (e.g., <PII_PERSON_1>)
          original: token.value,  // The original value
          position: token.start
        };
      });

      console.log('Mapped tokens:', tokens);

      return {
        redactedText: response.data.redacted_text,
        tokens
      };
    } catch (error) {
      if (axios.isAxiosError(error)) {
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
          end: token.position + token.original.length
        })),
      });
      return response.data.restored_text;
    } catch (error) {
      if (axios.isAxiosError(error)) {
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
      if (axios.isAxiosError(error)) {
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