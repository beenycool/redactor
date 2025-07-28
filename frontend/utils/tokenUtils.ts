import { RedactionToken } from '../services/redactionService';

/**
 * Batch tokens by type for easier processing and display
 * @param tokens - Array of redaction tokens
 * @returns Object with tokens grouped by type
 */
export function batchTokensByType(tokens: RedactionToken[]): Record<string, RedactionToken[]> {
  return tokens.reduce((acc, token) => {
    if (!acc[token.type]) {
      acc[token.type] = [];
    }
    acc[token.type].push(token);
    return acc;
  }, {} as Record<string, RedactionToken[]>);
}

/**
 * Sort tokens by their position in the text
 * @param tokens - Array of redaction tokens
 * @returns Sorted array of tokens
 */
export function sortTokensByPosition(tokens: RedactionToken[]): RedactionToken[] {
  return [...tokens].sort((a, b) => a.position - b.position);
}

/**
 * Validate tokens array to ensure all required fields are present
 * @param tokens - Array to validate
 * @returns Boolean indicating if tokens are valid
 */
export function validateTokens(tokens: any[]): tokens is RedactionToken[] {
  if (!Array.isArray(tokens)) return false;
  
  return tokens.every(token => 
    typeof token === 'object' &&
    typeof token.id === 'number' &&
    typeof token.type === 'string' &&
    typeof token.value === 'string' &&
    typeof token.original === 'string' &&
    typeof token.position === 'number'
  );
}

/**
 * Convert tokens to a formatted JSON string for display
 * @param tokens - Array of redaction tokens
 * @param pretty - Whether to pretty-print the JSON
 * @returns Formatted JSON string
 */
export function tokensToJson(tokens: RedactionToken[], pretty = true): string {
  const batched = batchTokensByType(tokens);
  const output = {
    summary: {
      totalTokens: tokens.length,
      tokensByType: Object.keys(batched).reduce((acc, type) => {
        acc[type] = batched[type].length;
        return acc;
      }, {} as Record<string, number>)
    },
    tokens: batched
  };
  
  return JSON.stringify(output, null, pretty ? 2 : 0);
}

/**
 * Parse JSON string to extract tokens
 * @param jsonString - JSON string containing tokens
 * @returns Array of redaction tokens or null if invalid
 */
export function parseTokensFromJson(jsonString: string): RedactionToken[] | null {
  try {
    const parsed = JSON.parse(jsonString);
    
    // Handle both flat array and nested structure
    let tokens: any[] = [];
    if (Array.isArray(parsed)) {
      tokens = parsed;
    } else if (parsed.tokens) {
      // If tokens is an object grouped by type, flatten it
      if (!Array.isArray(parsed.tokens)) {
        tokens = Object.values(parsed.tokens).flat();
      } else {
        tokens = parsed.tokens;
      }
    }
    
    if (validateTokens(tokens)) {
      return tokens;
    }
    
    return null;
  } catch (error) {
    console.error('Error parsing tokens from JSON:', error);
    return null;
  }
}

/**
 * Calculate statistics for redaction tokens
 * @param tokens - Array of redaction tokens
 * @returns Statistics object
 */
export function calculateTokenStatistics(tokens: RedactionToken[]) {
  // Handle empty tokens array
  if (!tokens || tokens.length === 0) {
    return {
      totalTokens: 0,
      uniqueValues: 0,
      typeBreakdown: [],
      mostCommonType: null
    };
  }

  const batched = batchTokensByType(tokens);
  const uniqueOriginals = new Set(tokens.map(t => t.original));
  
  return {
    totalTokens: tokens.length,
    uniqueValues: uniqueOriginals.size,
    typeBreakdown: Object.keys(batched).map(type => ({
      type,
      count: batched[type].length,
      percentage: (batched[type].length / tokens.length * 100).toFixed(1)
    })),
    mostCommonType: Object.keys(batched).reduce((a, b) =>
      batched[a].length > batched[b].length ? a : b
    )
  };
}

/**
 * Apply tokens to restore redacted text
 * @param redactedText - Text with redacted placeholders
 * @param tokens - Tokens containing original values
 * @returns Restored text
 */
export function applyTokensToText(redactedText: string, tokens: RedactionToken[]): string {
  let restoredText = redactedText;
  
  // Sort tokens by position in reverse order to avoid position shifts
  const sortedTokens = sortTokensByPosition(tokens).reverse();
  
  sortedTokens.forEach(token => {
    // Use position-based replacement instead of global regex
    const start = token.position;
    const end = start + token.value.length;
    
    // Verify the token value matches at the specified position
    if (restoredText.substring(start, end) === token.value) {
      restoredText =
        restoredText.substring(0, start) +
        token.original +
        restoredText.substring(end);
    }
  });
  
  return restoredText;
}