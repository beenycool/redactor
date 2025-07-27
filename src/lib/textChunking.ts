export interface TextChunk {
  text: string;
  startOffset: number;
}

/**
 * Estimates the number of tokens in a text string.
 * This is a simple approximation based on words, as we don't have access to the actual tokenizer.
 * @param text The text to estimate token count for
 * @returns Estimated number of tokens
 */
export function estimateTokenCount(text: string): number {
  // Simple estimation: average of 0.75 tokens per word
  // This is a rough approximation and may need adjustment based on actual model behavior
  return Math.ceil(text.split(/\s+/).length * 0.75);
}

/**
 * Splits text into chunks that fit within a token limit.
 * @param text The text to split
 * @param maxTokens Maximum number of tokens per chunk (default: 500 to leave some buffer)
 * @param overlapTokens Number of tokens to overlap between chunks (default: 50)
 * @returns Array of text chunks with their start offsets
 */
export function splitTextIntoChunks(
  text: string,
  maxTokens: number = 500,
  overlapTokens: number = 50
): TextChunk[] {
  // If the text is already within the limit, return as a single chunk
  if (estimateTokenCount(text) <= maxTokens) {
    return [{ text, startOffset: 0 }];
  }

  const chunks: TextChunk[] = [];
  const words = text.split(/(\s+)/); // Split by whitespace but keep the separators
  let currentOffset = 0;

  while (currentOffset < words.length) {
    // Calculate how many words we can include in this chunk
    let chunkEnd = currentOffset;
    let tokenCount = 0;
    
    // Add words until we reach the token limit
    while (chunkEnd < words.length && tokenCount < maxTokens) {
      const word = words[chunkEnd];
      // Estimate tokens for this word (1 token per word is a rough approximation)
      const wordTokens = word.trim() ? estimateTokenCount(word) : 0;
      if (tokenCount + wordTokens > maxTokens) break;
      
      tokenCount += wordTokens;
      chunkEnd++;
    }
    
    // If we couldn't add any words, add at least one word to avoid infinite loop
    if (chunkEnd <= currentOffset) {
      chunkEnd = currentOffset + 1;
    }
    
    // Create the chunk text
    const chunkText = words.slice(currentOffset, chunkEnd).join('');
    
    // Calculate start offset by summing lengths of all words before currentOffset
    let startOffset = 0;
    for (let i = 0; i < currentOffset; i++) {
      startOffset += words[i].length;
    }
    
    // Only add non-empty chunks
    if (chunkText.trim()) {
      chunks.push({
        text: chunkText,
        startOffset: startOffset
      });
    }
    
    // Calculate next offset with overlap
    if (chunkEnd >= words.length) break;
    
    // Move back by overlap amount
    let overlapWords = Math.floor(overlapTokens / 0.75); // Convert tokens back to words
    currentOffset = Math.max(currentOffset + 1, chunkEnd - overlapWords);
  }
  
  return chunks;
}

/**
 * Adjusts entity positions based on the chunk's offset in the original text.
 * @param entities Array of entities detected in a chunk
 * @param chunkOffset The start offset of the chunk in the original text
 * @returns Array of entities with adjusted positions
 */
export function adjustEntityPositions(entities: any[], chunkOffset: number): any[] {
  return entities.map(entity => ({
    ...entity,
    start: entity.start + chunkOffset,
    end: entity.end + chunkOffset
  }));
}

/**
 * Merges overlapping entities from different chunks using a greedy interval merging algorithm.
 * @param entities Array of entities from all chunks
 * @returns Array of merged entities with overlaps resolved
 */
export function mergeEntities(entities: any[]): any[] {
  if (entities.length === 0) return [];
  
  // Sort entities by start position
  const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
  
  // Merge overlapping entities using greedy algorithm
  const mergedEntities: any[] = [];
  let currentEntity = { ...sortedEntities[0] };
  
  for (let i = 1; i < sortedEntities.length; i++) {
    const nextEntity = sortedEntities[i];
    
    // Check if entities overlap or are adjacent
    if (nextEntity.start <= currentEntity.end) {
      // Overlap detected - merge entities
      // Take the union of their spans
      currentEntity.start = Math.min(currentEntity.start, nextEntity.start);
      currentEntity.end = Math.max(currentEntity.end, nextEntity.end);
      
      // Take the entity with higher score as the primary
      if (nextEntity.score > currentEntity.score) {
        currentEntity.entity_group = nextEntity.entity_group;
        currentEntity.word = nextEntity.word;
        currentEntity.score = nextEntity.score;
      } else {
        // Keep current entity but boost score slightly for consensus
        currentEntity.score = Math.min(1.0, currentEntity.score + 0.05);
      }
    } else {
      // No overlap - add current entity to result and move to next
      mergedEntities.push(currentEntity);
      currentEntity = { ...nextEntity };
    }
  }
  
  // Add the last entity
  mergedEntities.push(currentEntity);
  
  return mergedEntities;
}