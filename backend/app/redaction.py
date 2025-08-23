"""
PII Redaction Module using Piiranha model for personal information detection
"""

import re
from typing import List, Dict, Any, Tuple
import json, os
import torch
from transformers import AutoTokenizer, AutoModelForTokenClassification

class PIIRedactor:
    """
    Handles PII detection and redaction using the Piiranha model
    """
    
    def __init__(self, model_name: str = "iiiorg/piiranha-v1-detect-personal-information"):
        """
        Initialize the PII Redactor with the Piiranha model
        
        Args:
            model_name: HuggingFace model name for PII detection
        """
        import logging
        
        try:
            # Load tokenizer and model
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            self.model = AutoModelForTokenClassification.from_pretrained(model_name)
            
            # Set device
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
            self.model.to(self.device)
            
            # Set model to evaluation mode
            self.model.eval()
            
            logging.info(f"Successfully loaded model '{model_name}' on device {self.device}")
            
        except Exception as e:
            error_msg = f"Failed to load model '{model_name}': {str(e)}"
            logging.error(error_msg)
            raise RuntimeError(error_msg) from e
        
        # Token counter per request is now provided at call sites; keep attribute for backward compatibility but unused in generation
        self.token_counter = {}
        
        # Maximum tokens per chunk (leaving room for special tokens)
        self.max_length = 512
    
    def _split_text_into_chunks(self, text: str) -> List[Tuple[str, int]]:
        """
        Split text into chunks that fit within token limit
        
        Args:
            text: Input text to split
            
        Returns:
            List of (chunk_text, start_offset) tuples
        """
        # Token-based chunking to fit within model's token limit
        # Uses tokenizer to map tokens to character offsets

        # Tokenize the entire text with offset mapping
        encoding = self.tokenizer(
            text,
            return_offsets_mapping=True,
            add_special_tokens=False
        )
        input_ids = encoding["input_ids"]
        offsets = encoding["offset_mapping"]

        chunks = []
        chunk_size = self.max_length  # 512 tokens
        overlap = 32  # Overlap tokens between chunks for context

        i = 0
        while i < len(input_ids):
            # Determine chunk token indices
            chunk_start = i
            chunk_end = min(i + chunk_size, len(input_ids))

            # Get character start/end for chunk
            char_start = offsets[chunk_start][0]
            char_end = offsets[chunk_end - 1][1]

            chunk_text = text[char_start:char_end]
            chunks.append((chunk_text, char_start))

            # Move to next chunk with overlap
            if chunk_end < len(input_ids):
                i = chunk_end - overlap
            else:
                i = chunk_end

        return chunks
    
    def _generate_redaction_token(self, entity_type: str, token_counter: Dict[str, int]) -> str:
        """
        Generate a unique descriptive redaction token for an entity type using a request-scoped counter
        
        Args:
            entity_type: Type of entity
            token_counter: Mutable dict used to count tokens for this single request
            
        Returns:
            Descriptive redaction token
        """
        # Lazy-load shared mapping JSON once
        if not hasattr(self, '_shared_type_mapping'):
            mapping_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'shared', 'type_mappings.json')
            try:
                with open(mapping_path, 'r', encoding='utf-8') as f:
                    self._shared_type_mapping = json.load(f)
            except Exception:
                self._shared_type_mapping = {}

        clean_type = entity_type.replace('B-', '').replace('I-', '').upper()
        descriptive_type = self._shared_type_mapping.get(clean_type, clean_type)

        # Use the provided per-request counter
        count = token_counter.get(descriptive_type, 0) + 1
        token_counter[descriptive_type] = count
        return f"<PII_{descriptive_type}_{count}>"
    
    def _detect_pii_in_chunk(self, text: str, chunk_offset: int = 0) -> List[Dict[str, Any]]:
        """
        Detect PII in a single chunk of text
        
        Args:
            text: Text chunk to analyze
            chunk_offset: Character offset of this chunk in the full text
            
        Returns:
            List of detected PII entities
        """
        # Tokenize with offset mapping
        encoded = self.tokenizer.encode_plus(
            text,
            return_tensors="pt",
            truncation=True,
            padding=True,
            max_length=self.max_length,
            return_offsets_mapping=True,
            add_special_tokens=True
        )
        
        # Move inputs to device
        inputs = {k: v.to(self.device) for k, v in encoded.items() if k != 'offset_mapping'}
        offset_mapping = encoded['offset_mapping'][0]
        
        # Get predictions
        with torch.no_grad():
            outputs = self.model(**inputs)
        
        predictions = torch.argmax(outputs.logits, dim=-1)[0]
        
        # Convert predictions to entities
        entities = []
        current_entity = None
        
        for i, (start, end) in enumerate(offset_mapping):
            if start == end:  # Special token
                continue
                
            label_id = predictions[i].item()
            
            # Get the 'O' label ID from model's label2id mapping
            o_label_id = self.model.config.label2id.get('O', 17)  # Default to 17 based on model inspection
            
            if label_id != o_label_id:  # Not 'O' label
                label = self.model.config.id2label[label_id]
                
                # Extract entity value - handle whitespace properly
                entity_text = text[start:end]
                
                # Remove 'I-' prefix (this model only uses I- labels)
                entity_type = label.replace('I-', '')
                
                # Check if this is continuation of previous entity of same type
                # Convert positions to absolute for comparison
                abs_start = start + chunk_offset
                abs_end = end + chunk_offset
                if (current_entity and
                    current_entity['type'] == entity_type and
                    abs_start <= current_entity['end'] + 1):  # Allow for single-space gap
                    # Properly handle gap BEFORE updating end
                    prev_end_abs = current_entity['end']
                    gap_text = ""
                    if abs_start > prev_end_abs:
                        # slice text using chunk-relative indexes
                        prev_end_rel = prev_end_abs - chunk_offset
                        gap_text = text[prev_end_rel:start]
                    current_entity['end'] = abs_end
                    current_entity['value'] += gap_text + entity_text
                else:
                    # Save previous entity if exists
                    if current_entity:
                        # Clean up entity value
                        current_entity['value'] = current_entity['value'].strip()
                        entities.append(current_entity)
                    
                    # Start new entity
                    current_entity = {
                        'value': entity_text,
                        'type': entity_type,
                        'start': abs_start,
                        'end': abs_end,
                        'score': torch.softmax(outputs.logits[0][i], dim=-1).max().item()
                    }
            else:
                # End of entity
                if current_entity:
                    # Clean up entity value
                    current_entity['value'] = current_entity['value'].strip()
                    entities.append(current_entity)
                    current_entity = None
        
        # Don't forget last entity
        if current_entity:
            current_entity['value'] = current_entity['value'].strip()
            entities.append(current_entity)
        
        return entities
    
    def detect_pii(self, text: str, token_counter: Dict[str, int], confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """
        Detect PII entities in text with batching support

        Args:
            text: Input text to analyze
            token_counter: Request-scoped token counter dict used for token generation
            confidence_threshold: Minimum confidence score for entities (0.0-1.0)

        Returns:
            List of detected PII entities with metadata
        """
        # Split text into chunks
        chunks = self._split_text_into_chunks(text)

        all_entities = []

        for chunk_text, chunk_offset in chunks:
            entities = self._detect_pii_in_chunk(chunk_text, chunk_offset)
            all_entities.extend(entities)

        # Merge overlapping entities of the same type
        filtered_entities = []
        for entity in all_entities:
            # Check for overlap with existing entities
            merged = False
            for i, existing in enumerate(filtered_entities):
                if (entity['start'] < existing['end'] and
                    entity['end'] > existing['start'] and
                    entity['type'] == existing['type']):
                    # Overlapping entities of the same type - merge them
                    # Calculate merged span
                    merged_start = min(entity['start'], existing['start'])
                    merged_end = max(entity['end'], existing['end'])

                    # Create merged entity with highest score
                    merged_entity = {
                        'value': text[merged_start:merged_end],
                        'type': entity['type'],
                        'start': merged_start,
                        'end': merged_end,
                        'score': max(entity['score'], existing['score'])
                    }

                    filtered_entities[i] = merged_entity
                    merged = True
                    break
                elif (entity['start'] < existing['end'] and
                      entity['end'] > existing['start'] and
                      entity['type'] != existing['type']):
                    # Overlapping entities of different types - keep higher score
                    if entity['score'] > existing['score']:
                        filtered_entities[i] = entity
                    merged = True
                    break

            if not merged:
                filtered_entities.append(entity)

        # Sort by position
        filtered_entities.sort(key=lambda x: x['start'])

        # Filter by confidence threshold
        filtered_entities = [e for e in filtered_entities if e.get('score', 0) >= confidence_threshold]

        # Generate redaction tokens using the request-scoped counter
        for entity in filtered_entities:
            entity['token'] = self._generate_redaction_token(entity['type'], token_counter)

        return filtered_entities
    
    def redact_text(self, text: str, confidence_threshold: float = 0.5) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Redact PII from text and return redacted text with token mappings

        Args:
            text: Original text to redact
            confidence_threshold: Minimum confidence score for entities (0.0-1.0)

        Returns:
            Tuple of (redacted_text, token_mappings)
        """
        # Create a fresh, request-scoped token counter
        token_counter: Dict[str, int] = {}

        # Detect PII entities with request-scoped counter and confidence threshold
        entities = self.detect_pii(text, token_counter, confidence_threshold)
        
        # If no entities found, return original text
        if not entities:
            return text, []
        
        # Build redacted text
        redacted_parts = []
        last_end = 0
        
        for entity in entities:
            # Add text before entity
            redacted_parts.append(text[last_end:entity['start']])
            # Add redaction token
            redacted_parts.append(entity['token'])
            last_end = entity['end']
        
        # Add remaining text
        redacted_parts.append(text[last_end:])
        
        redacted_text = ''.join(redacted_parts)
        
        # Create token mappings for API response
        token_mappings = []
        for entity in entities:
            # Ensure we have valid values - skip entities with empty values
            if entity['value'].strip():
                token_mappings.append({
                    'token': entity['token'],
                    'value': entity['value'].strip(),
                    'type': entity['type'],
                    'start': entity['start'],
                    'end': entity['end']
                })
        
        return redacted_text, token_mappings
    
    def restore_text(self, redacted_text: str, token_mappings: List[Dict[str, Any]]) -> str:
        """
        Restore original text from redacted text using token mappings
        
        Args:
            redacted_text: Text with PII tokens
            token_mappings: List of token mappings
            
        Returns:
            Restored text with original values
        """
        restored_text = redacted_text
        
        # Validate that all tokens exist in the redacted text
        for mapping in token_mappings:
            if mapping['token'] not in redacted_text:
                raise ValueError(f"Token '{mapping['token']}' not found in redacted text")
        
        # Sort mappings by token length (longest first) to avoid partial replacements
        sorted_mappings = sorted(
            token_mappings,
            key=lambda x: len(x['token']),
            reverse=True
        )
        
        # Replace each token with its original value using regex for exact matches
        for mapping in sorted_mappings:
            # Escape the token for use in regex pattern
            escaped_token = re.escape(mapping['token'])
            # Use word boundaries to ensure exact token match
            pattern = rf'{escaped_token}'
            restored_text = re.sub(
                pattern,
                mapping['value'],
                restored_text
            )
        
        return restored_text


class EnhancedPIIRedactor(PIIRedactor):
    def __init__(self, model_name: str = "iiiorg/piiranha-v1-detect-personal-information"):
        super().__init__(model_name)
        self.name_consistency_map = {}
        self.batch_size = 4  # Process multiple chunks in parallel
        
    def _detect_pii_batch(self, chunks: List[Tuple[str, int]]) -> List[Dict[str, Any]]:
        """
        Process multiple chunks in a batch for efficiency
        """
        import concurrent.futures
        
        all_entities = []
        
        # Process chunks in parallel using ThreadPoolExecutor
        with concurrent.futures.ThreadPoolExecutor(max_workers=self.batch_size) as executor:
            futures = []
            for chunk_text, chunk_offset in chunks:
                future = executor.submit(self._detect_pii_in_chunk, chunk_text, chunk_offset)
                futures.append(future)
            
            # Collect results
            for future in concurrent.futures.as_completed(futures):
                entities = future.result()
                all_entities.extend(entities)
        
        return all_entities
    
    def detect_pii_with_consistency(self, text: str, token_counter: Dict[str, int], confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
        """
        Enhanced PII detection with name consistency
        """
        # Split into chunks
        chunks = self._split_text_into_chunks(text)
        
        # Batch process chunks
        batch_entities = []
        for i in range(0, len(chunks), self.batch_size):
            batch = chunks[i:i + self.batch_size]
            entities = self._detect_pii_batch(batch)
            batch_entities.extend(entities)
        
        # Build name consistency map
        self._build_name_consistency_map(batch_entities, text)
        
        # Apply consistency rules
        consistent_entities = self._apply_name_consistency(batch_entities, text, token_counter)
        
        # Merge with pattern-based detection
        pattern_entities = self._detect_patterns(text)
        
        # Combine and deduplicate
        # Combine and deduplicate
        all_entities = self._merge_entities(consistent_entities + pattern_entities, text)
        
        # Filter by confidence threshold
        all_entities = [e for e in all_entities if e.get('score', 0) >= confidence_threshold]
        # Generate tokens
        for entity in all_entities:
            entity['token'] = self._generate_redaction_token(entity['type'], token_counter)
        
        return all_entities
    
    def _build_name_consistency_map(self, entities: List[Dict], text: str):
        """
        Build a map of name components for consistency
        """
        self.name_consistency_map = {}
        
        for entity in entities:
            if entity['type'] in ['PERSON', 'GIVENNAME', 'SURNAME']:
                # Split name into components
                name_parts = entity['value'].split()
                for part in name_parts:
                    normalized = part.lower()
                    if normalized not in self.name_consistency_map:
                        self.name_consistency_map[normalized] = {
                            'original_entity': entity,
                            'occurrences': []
                        }
                    
                    # Find all occurrences of this name part in text
                    import re
                    pattern = re.compile(rf'\b{re.escape(part)}\b', re.IGNORECASE)
                    for match in pattern.finditer(text):
                        self.name_consistency_map[normalized]['occurrences'].append({
                            'start': match.start(),
                            'end': match.end(),
                            'value': match.group()
                        })
    
    def _apply_name_consistency(self, entities: List[Dict], text: str, token_counter: Dict[str, int]) -> List[Dict]:
        """
        Apply consistency rules to ensure all instances of names are redacted
        """
        enhanced_entities = entities.copy()
        
        # Add missing name instances
        for name_key, info in self.name_consistency_map.items():
            original_entity = info['original_entity']
            
            for occurrence in info['occurrences']:
                # Check if this occurrence is already covered
                already_covered = any(
                    e['start'] <= occurrence['start'] < e['end'] or
                    e['start'] < occurrence['end'] <= e['end']
                    for e in enhanced_entities
                )
                
                if not already_covered:
                    # Add new entity for this occurrence
                    enhanced_entities.append({
                        'value': occurrence['value'],
                        'type': f"{original_entity['type']}_CONSISTENT",
                        'start': occurrence['start'],
                        'end': occurrence['end'],
                        'score': 0.9  # High confidence for consistency matches
                    })
        
        return enhanced_entities
    
    def _detect_patterns(self, text: str) -> List[Dict[str, Any]]:
        """
        Enhanced pattern detection with improved regex
        """
        pattern_entities = []
        
        # Enhanced patterns for better coverage
        enhanced_patterns = {
            **self.patterns,
            'PERSON_NAME': re.compile(
                r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}\b'
            ),
            'INITIALS': re.compile(
                r'\b[A-Z]\.?\s*[A-Z]\.?\s*[A-Z]?\.?\b'
            ),
            'TITLE_NAME': re.compile(
                r'\b(?:Mr|Mrs|Ms|Dr|Prof|Rev|Judge|Officer)\.?\s+[A-Z][a-z]+\b',
                re.IGNORECASE
            )
        }
        
        for pattern_type, pattern in enhanced_patterns.items():
            for match in pattern.finditer(text):
                pattern_entities.append({
                    'value': match.group(0),
                    'type': pattern_type,
                    'start': match.start(),
                    'end': match.end(),
                    'score': 0.95
                })
        
        return pattern_entities
    
    def _merge_entities(self, entities: List[Dict], text: str) -> List[Dict]:
        """
        Intelligent merging of overlapping entities
        """
        if not entities:
            return []
        
        # Sort by start position, then by score (higher first)
        sorted_entities = sorted(entities, key=lambda x: (x['start'], -x.get('score', 0)))
        
        merged = []
        for entity in sorted_entities:
            # Check for overlap with existing entities
            overlap = False
            for i, existing in enumerate(merged):
                if (entity['start'] < existing['end'] and
                    entity['end'] > existing['start']):
                    # Overlapping - keep the one with higher score or merge
                    if entity.get('score', 0) > existing.get('score', 0):
                        merged[i] = entity
                    elif entity['type'] == existing['type']:
                        # Same type - extend the range
                        merged[i]['start'] = min(entity['start'], existing['start'])
                        merged[i]['end'] = max(entity['end'], existing['end'])
                        merged[i]['value'] = text[merged[i]['start']:merged[i]['end']]
                    overlap = True
                    break
            
            if not overlap:
                merged.append(entity)
        
        return merged
