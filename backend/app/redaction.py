"""
PII Redaction Module using Piiranha model for personal information detection
"""

import re
from typing import List, Dict, Any, Tuple
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
        
        # Token counter for unique IDs
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
        # Simple character-based chunking with overlap
        chunk_size = 2000  # Approximate characters per chunk
        overlap = 200      # Character overlap between chunks
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = min(start + chunk_size, len(text))
            
            # Try to find a sentence boundary
            if end < len(text):
                # Look for sentence end
                for sep in ['. ', '.\n', '! ', '? ', '\n\n']:
                    last_sep = text.rfind(sep, start, end)
                    if last_sep > start + chunk_size // 2:
                        end = last_sep + len(sep)
                        break
            
            chunk = text[start:end]
            chunks.append((chunk, start))
            
            # Move start position with overlap
            start = end - overlap if end < len(text) else end
        
        return chunks
    
    def _generate_redaction_token(self, entity_type: str) -> str:
        """
        Generate a unique redaction token for an entity type
        
        Args:
            entity_type: Type of entity
            
        Returns:
            Unique redaction token
        """
        # Clean entity type (remove B- or I- prefixes)
        clean_type = entity_type.replace('B-', '').replace('I-', '').upper()
        
        if clean_type not in self.token_counter:
            self.token_counter[clean_type] = 0
        
        self.token_counter[clean_type] += 1
        return f"<PII_{clean_type}_{self.token_counter[clean_type]}>"
    
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
            o_label_id = self.model.config.label2id.get('O')
            if o_label_id is None:
                # Handle case where 'O' label is not present in model configuration
                # This is unusual but possible - log warning and skip processing
                import warnings
                warnings.warn("'O' label not found in model configuration, skipping token classification")
                continue
            
            if label_id != o_label_id:  # Not 'O' label
                label = self.model.config.id2label[label_id]
                
                # Extract entity value
                entity_text = text[start:end]
                
                # Check if this is continuation of previous entity
                if current_entity and label.startswith('I-'):
                    # Extend current entity
                    current_entity['end'] = end + chunk_offset
                    current_entity['value'] += ' ' + entity_text
                else:
                    # Save previous entity if exists
                    if current_entity:
                        entities.append(current_entity)
                    
                    # Start new entity
                    entity_type = label.replace('B-', '').replace('I-', '')
                    current_entity = {
                        'value': entity_text,
                        'type': entity_type,
                        'start': start + chunk_offset,
                        'end': end + chunk_offset,
                        'score': torch.softmax(outputs.logits[0][i], dim=-1).max().item()
                    }
            else:
                # End of entity
                if current_entity:
                    entities.append(current_entity)
                    current_entity = None
        
        # Don't forget last entity
        if current_entity:
            entities.append(current_entity)
        
        return entities
    
    def detect_pii(self, text: str) -> List[Dict[str, Any]]:
        """
        Detect PII entities in text with batching support
        
        Args:
            text: Input text to analyze
            
        Returns:
            List of detected PII entities with metadata
        """
        # Reset token counter for each document
        self.token_counter = {}
        
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
        
        # Generate redaction tokens
        for entity in filtered_entities:
            entity['token'] = self._generate_redaction_token(entity['type'])
        
        return filtered_entities
    
    def redact_text(self, text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Redact PII from text and return redacted text with token mappings
        
        Args:
            text: Original text to redact
            
        Returns:
            Tuple of (redacted_text, token_mappings)
        """
        # Detect PII entities
        entities = self.detect_pii(text)
        
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
            token_mappings.append({
                'token': entity['token'],
                'value': entity['value'],
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
    """
    Enhanced PII Redactor with additional pattern matching for court-specific data
    """
    
    def __init__(self, model_name: str = "iiiorg/piiranha-v1-detect-personal-information"):
        super().__init__(model_name)
        
        # Additional regex patterns for court-specific PII
        self.patterns = {
            'CASE_NUMBER': re.compile(
                r'\b(?:Case|Docket|File)\s*(?:No\.?|Number|#|ID)?\s*:?\s*'
                r'[A-Z0-9]{2,}-(?:CR|CV|DR|PR)-[0-9]{2,}(?:-[A-Z0-9]+)?\b',
                re.IGNORECASE
            ),
            'COURT_ID': re.compile(
                r'\b(?:Court\s*ID|Judge\s*ID|Bar\s*(?:No|Number)|Attorney\s*(?:No|Number))'
                r'\s*:?\s*[A-Z0-9]{5,}\b',
                re.IGNORECASE
            ),
            'SSN': re.compile(
                r'\b(?:(?:SSN|Social\s*Security)\s*(?:No\.?|Number|#)?\s*:?\s*)?'
                r'(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b',
                re.IGNORECASE
            ),
            'DRIVER_LICENSE': re.compile(
                r'\b(?:DL|Driver\'s?\s*License)\s*(?:No\.?|Number|#)?\s*:?\s*'
                r'[A-Z0-9]{6,}\b',
                re.IGNORECASE
            ),
            'BADGE_NUMBER': re.compile(
                r'\b(?:Badge|Officer)\s+(?:No\.?|Number)\s*:?\s*'
                r'[A-Z0-9]{4,}\b',
                re.IGNORECASE
            )
        }
    
    def detect_pii(self, text: str) -> List[Dict[str, Any]]:
        """
        Enhanced PII detection with pattern matching for court documents
        """
        # Get entities from model
        entities = super().detect_pii(text)
        
        # Add pattern-based detection
        for pattern_type, pattern in self.patterns.items():
            matches = pattern.finditer(text)
            for match in matches:
                start, end = match.span()
                
                # Check if this region is already covered
                covered = any(
                    e['start'] <= start < e['end'] or e['start'] < end <= e['end']
                    for e in entities
                )
                
                if not covered:
                    redaction_token = self._generate_redaction_token(pattern_type)
                    entities.append({
                        'token': redaction_token,
                        'value': match.group(),
                        'type': pattern_type,
                        'start': start,
                        'end': end,
                        'score': 1.0  # Pattern matches have high confidence
                    })
        
        # Re-sort by position
        entities.sort(key=lambda x: x['start'])
        
        return entities