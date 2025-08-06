import { RedactionToken } from '../services/redactionService';

/**
 * Batch tokens by type for easier processing and display
 * Note: Frontend no longer performs restoration using token positions.
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
 * Validate tokens array to ensure all required fields are present.
 * Position is retained only for display/debug purposes. Restoration is delegated to backend.
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
 * Convert tokens to a formatted JSON string for display and debugging.
 */
export function tokensToJson(tokens: RedactionToken[], pretty = true): string {
  const batched = batchTokensByType(tokens);

  const transformedBatched = Object.keys(batched).reduce((acc, type) => {
    acc[type] = batched[type].map(token => ({
      id: token.id,
      type: token.type,
      value: token.value,    // Redaction placeholder (e.g., <PII_NAME_1>)
      original: token.original,
      position: token.position
    }));
    return acc;
  }, {} as Record<string, any[]>);

  const output = {
    summary: {
      totalTokens: tokens.length,
      tokensByType: Object.keys(batched).reduce((acc, type) => {
        acc[type] = batched[type].length;
        return acc;
      }, {} as Record<string, number>)
    },
    tokens: transformedBatched
  };

  return JSON.stringify(output, null, pretty ? 2 : 0);
}

/**
 * Parse JSON string to extract tokens.
 */
export function parseTokensFromJson(jsonString: string): RedactionToken[] | null {
  try {
    const parsed = JSON.parse(jsonString);

    let tokens: any[] = [];
    if (Array.isArray(parsed)) {
      tokens = parsed;
    } else if (parsed.tokens) {
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
 * Count tokens by type using batchTokensByType
 */
export function tokensByTypeCount(tokens: RedactionToken[]): Record<string, number> {
  const batched = batchTokensByType(tokens);
  return Object.keys(batched).reduce((acc, type) => {
    acc[type] = batched[type].length;
    return acc;
  }, {} as Record<string, number>);
}

/**
 * Token statistics utility (display-only).
 */
export function calculateTokenStatistics(tokens: RedactionToken[]) {
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

// Note: Any restoration of redacted text must be performed via the backend restore endpoint.
// The former position-based applyTokensToText() has been removed to prevent incorrect restoration.