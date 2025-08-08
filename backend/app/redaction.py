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
    
    def _generate_redaction_token(self, entity_type: str, token_counter: Dict[str, int]) -> str:
        """
        Generate a unique descriptive redaction token for an entity type using a request-scoped counter
        
        Args:
            entity_type: Type of entity
            token_counter: Mutable dict used to count tokens for this single request
            
        Returns:
            Descriptive redaction token
        """
        # Clean entity type (remove B- or I- prefixes)
        clean_type = entity_type.replace('B-', '').replace('I-', '').upper()

        # Map entity types to more descriptive names
        type_mapping = {
            'GIVENNAME': 'NAME',
            'SURNAME': 'NAME',
            'PERSON': 'NAME',
            'PERSONTYPE': 'PERSON_TYPE',
            'NORP': 'NATIONALITY',
            'FAC': 'FACILITY',
            'ORG': 'ORGANIZATION',
            'GPE': 'LOCATION',
            'LOC': 'LOCATION',
            'PRODUCT': 'PRODUCT',
            'EVENT': 'EVENT',
            'WORK_OF_ART': 'ARTWORK',
            'LAW': 'LEGAL_REFERENCE',
            'LANGUAGE': 'LANGUAGE',
            'DATE': 'DATE',
            'TIME': 'TIME',
            'PERCENT': 'PERCENTAGE',
            'MONEY': 'MONETARY_AMOUNT',
            'QUANTITY': 'QUANTITY',
            'ORDINAL': 'ORDINAL_NUMBER',
            'CARDINAL': 'NUMBER',
            'SSN': 'SSN',
            'PHONE': 'PHONE_NUMBER',
            'EMAIL': 'EMAIL_ADDRESS',
            'ADDRESS': 'ADDRESS',
            'CASE_NUMBER': 'CASE_NUMBER',
            'COURT_ID': 'COURT_ID',
            'DRIVER_LICENSE': 'DRIVER_LICENSE',
            'BADGE_NUMBER': 'BADGE_NUMBER',
            'NATIONAL_INSURANCE': 'NATIONAL_INSURANCE',
            'UK_POSTCODE': 'POSTCODE',
            # Added new types for enhanced patterns
            'VEHICLE_REGISTRATION': 'VEHICLE_REGISTRATION',
            'BANK_SORT_CODE': 'BANK_SORT_CODE',
            'ACCOUNT_NUMBER': 'ACCOUNT_NUMBER',
            'PARTIAL_CARD_NUMBER': 'PARTIAL_CARD_NUMBER',
            'FINANCIAL_AMOUNT': 'FINANCIAL_AMOUNT',
            'MEDICAL_ID': 'MEDICAL_ID',
            'LEGAL_ID': 'LEGAL_ID',
            'POLICE_ID': 'POLICE_ID',
            'ALPHANUMERIC_CODE': 'ALPHANUMERIC_CODE',
            'GENERIC_ID': 'GENERIC_ID',
            'FILENAME': 'FILENAME'
        }

        descriptive_type = type_mapping.get(clean_type, clean_type)

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
                if (current_entity and
                    current_entity['type'] == entity_type and
                    start <= current_entity['end'] + 1):  # Allow for single space gap
                    # Extend current entity
                    current_entity['end'] = end + chunk_offset
                    # Properly handle the text between entities
                    gap_text = text[current_entity['end'] - chunk_offset:start]
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
                        'start': start + chunk_offset,
                        'end': end + chunk_offset,
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
    
    def detect_pii(self, text: str, token_counter: Dict[str, int]) -> List[Dict[str, Any]]:
        """
        Detect PII entities in text with batching support

        Args:
            text: Input text to analyze
            token_counter: Request-scoped token counter dict used for token generation

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

        # Generate redaction tokens using the request-scoped counter
        for entity in filtered_entities:
            entity['token'] = self._generate_redaction_token(entity['type'], token_counter)

        return filtered_entities
    
    def redact_text(self, text: str) -> Tuple[str, List[Dict[str, Any]]]:
        """
        Redact PII from text and return redacted text with token mappings

        Args:
            text: Original text to redact

        Returns:
            Tuple of (redacted_text, token_mappings)
        """
        # Create a fresh, request-scoped token counter
        token_counter: Dict[str, int] = {}

        # Detect PII entities with request-scoped counter
        entities = self.detect_pii(text, token_counter)
        
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
            # --- IDENTIFIERS ---
            'CASE_NUMBER': re.compile(
                r'\b(?:Case|Docket|File|Claim|Ref|Reference)\s*(?:No\.?|Number|#|ID)?\s*:?\s*'
                r'[A-Z0-9]{2,}[-/][A-Z0-9-]{2,}\b',
                re.IGNORECASE
            ),
            'POLICE_ID': re.compile(
                r'\b(?:Badge\s*(?:No\.?|Number)?|PC|Officer|Incident\s*Log)\s*:?\s*[A-Z0-9-]{4,}\b',
                re.IGNORECASE
            ),
            'MEDICAL_ID': re.compile(
                r'\b(?:GMC\s*(?:reg(?:istration)?)?|HCPC\s*(?:reg(?:istration)?)?|Patient\s*ID)\s*:?\s*[A-Z0-9-]{5,}\b',
                re.IGNORECASE
            ),
            'LEGAL_ID': re.compile(
                r'\b(?:SRA\s*ID|LAA|Legal\s*Aid\s*Account)\s*:?\s*[A-Z0-9-]{5,}\b',
                re.IGNORECASE
            ),
            'DRIVER_LICENSE': re.compile(
                r'\b(?:DL|Driver\'s?\s*License)\s*(?:No\.?|Number|#)?\s*:?\s*'
                r'[A-Z]{5}[0-9]{6}[A-Z0-9]{2}[A-Z]{2}\b',
                re.IGNORECASE
            ),
            'NATIONAL_INSURANCE': re.compile(
                r'\b[A-CEGHJ-PR-TW-Z]{2}\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b',
                re.IGNORECASE
            ),
            'VEHICLE_REGISTRATION': re.compile(
                r'\b[A-Z]{2}\d{2}\s?[A-Z]{3}\b',
                re.IGNORECASE
            ),
             'ALPHANUMERIC_CODE': re.compile(
                r'\b(?:INV|Employee\s*(?:ID|number)|Ref)\s*[:-]?\s*[A-Z0-9-]{4,}\b',
                 re.IGNORECASE
            ),
            'GENERIC_ID': re.compile(r'\b(?:policy|reference|member)\s*(?:No\.?|number|#|ID)\s*:?\s*[A-Z0-9-]{5,}\b', re.IGNORECASE),
            'FILENAME': re.compile(r'\b[A-Z0-9_]+\.(?:MP4|PDF|DOCX|JPG|PNG)\b', re.IGNORECASE),

            # --- FINANCIAL ---
            'BANK_SORT_CODE': re.compile(r'\b\d{2}-\d{2}-\d{2}\b'),
            'ACCOUNT_NUMBER': re.compile(r'\b(?:account|acct)\s*(?:No\.?|number)?\s*:?\s*\d{8,}\b', re.IGNORECASE),
            'PARTIAL_CARD_NUMBER': re.compile(r'\b(?:ending\s*in|ending\s*with)\s*\d{4}\b', re.IGNORECASE),
            'FINANCIAL_AMOUNT': re.compile(r'£\d{1,3}(?:,\d{3})*(?:\.\d{2})?'),
            
            # --- CONTACT & LOCATION ---
            'UK_POSTCODE': re.compile(
                r'\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b',
                re.IGNORECASE
            ),
            'PHONE': re.compile(
                r'\b(?:(?:\+44\s?|0)7\d{3}\s?\d{6}|(?:0\d{4}\s?\d{6}))\b'
            ),
            'EMAIL': re.compile(
                r'\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b'
            ),
            
            # --- DATES ---
            'DATE': re.compile(
                r'\b(?:\d{1,2}(?:st|nd|rd|th)?\s+of\s+)?(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,)?\s+\d{4}\b',
                re.IGNORECASE
            )
        }
    
    def detect_pii(self, text: str, token_counter: Dict[str, int]) -> List[Dict[str, Any]]:
        """
        Enhanced PII detection with pattern matching for court documents
        """
        # Get entities from model first
        model_entities = super().detect_pii(text, {}) # Use a temporary counter for the model pass

        # --- Run pattern-based detection ---
        pattern_entities = []
        for pattern_type, pattern in self.patterns.items():
            for match in pattern.finditer(text):
                start, end = match.span()
                pattern_entities.append({
                    'value': match.group(0),
                    'type': pattern_type,
                    'start': start,
                    'end': end,
                    'score': 1.0  # Pattern matches have high confidence
                })

        # --- Merge model and pattern results ---
        # Combine lists and sort by start position, then by end position descending (longest match first)
        combined_entities = sorted(model_entities + pattern_entities, key=lambda x: (x['start'], -x['end']))
        
        merged_entities = []
        last_end_pos = -1

        for entity in combined_entities:
            # If the current entity starts after or at the same position the last one ended, it's a clean addition.
            if entity['start'] >= last_end_pos:
                merged_entities.append(entity)
                last_end_pos = entity['end']
            # This logic implicitly handles overlaps by prioritizing the longest match that appears first in the sorted list.
            # Any smaller or overlapping entities that start at the same position or later but before the last_end_pos are ignored.
        
        # Final pass to generate unique tokens for the final, merged list
        final_entities = []
        for entity in merged_entities:
             # Ensure we have valid values - skip entities with empty values
            if entity['value'].strip():
                entity['token'] = self._generate_redaction_token(entity['type'], token_counter)
                final_entities.append(entity)

        return final_entities
