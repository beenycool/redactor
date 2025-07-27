# PII Redactor App

A Next.js app that redacts personal info from court/psychiatric reports using advanced PII detection models and pattern matching.

## What it does

- Uses a modern text editor with inline PII highlighting for review
- Processes text using local JavaScript models, SmolLM3, or pattern matching
- Detects legal/medical PII like names, case numbers, addresses with confidence scoring
- Supports interactive entity acceptance/rejection before redaction
- Provides feedback system for improving model accuracy

## Enhanced PII Detection

The application now uses multiple layers of PII detection for improved accuracy:

### Local JavaScript Models
- **Piiranha Model**: Specialized for PII detection (`iiiorg/piiranha-v1-detect-personal-information`)
- **BERT Fallback**: General NER model (`Xenova/bert-base-NER`) when Piiranha fails
- **Text Chunking**: Processes large documents by splitting into manageable chunks
- **Entity Merging**: Combines overlapping entities from different chunks

### Pattern Matching
- **Context-Aware Patterns**: Enhanced regex patterns for specific contexts (legal, medical)
- **Validation Patterns**: Additional patterns to catch missed PII
- **Template Support**: Domain-specific templates (court, medical, psychiatric)

### SmolLM3 Integration
- **Enhanced Validation**: Contextual validation of redacted text
- **Entity Extraction**: Additional NER capabilities
- **Multiple Endpoints**: Supports generation, validation, and entity extraction

## Modern UI Features

### Interactive Editor
- Real-time PII highlighting with confidence indicators
- Keyboard navigation (Tab/Shift+Tab) through detected entities
- Entity acceptance/rejection system with visual feedback
- Confidence threshold slider to filter low-confidence detections
- Undo/redo functionality for text modifications

### Customization
- **Custom Word Lists**: Define words to always redact or always ignore
- **Redaction Templates**: Predefined templates for different document types
- **Confidence Control**: Adjustable threshold for entity detection

### Validation & Feedback
- **Model Status**: Real-time API capability checking
- **Feedback Reporting**: Report false positives/negatives to improve accuracy
- **Pattern Validation**: Additional validation pass to catch missed PII

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file with:
```env
# Optional: HuggingFace token for enhanced model access
HF_TOKEN=your_huggingface_token_here

# Optional: custom SmolLM3 endpoint
SMOLLM3_URL=https://0b0747d71cf4.ngrok-free.app
```

You can also set a custom SmolLM3 URL directly in the web interface using the URL input box.

3. Run the app:
```bash
npm run dev
```
Visit http://localhost:3000

## How to use

1. Paste report in the editor
2. Review highlighted PII entities:
   - Yellow: Detected PII
   - Yellow dotted: Low confidence (below threshold)
   - Red: Accepted for redaction
3. Use Tab/Shift+Tab to navigate entities, Space/Enter to accept/reject
4. Adjust confidence threshold as needed
5. Click "Redact PII" to process
6. Edit redacted text if needed
7. Click "Restore PII" to see original text with PII restored

## Processing Methods

- **Local Models**: JavaScript-based models running in the browser (Piiranha + BERT)
- **SmolLM3**: Uses the SmolLM3 API for contextual PII detection and validation
- **Pattern Matching**: Uses regex patterns for basic PII detection

## Redaction Templates

The application supports domain-specific templates:
- **Court Documents**: Legal-specific PII patterns
- **Medical Records**: HIPAA-compliant medical document redaction
- **Psychiatric Reports**: Mental health document redaction
- **Basic PII**: Essential PII redaction only

## API Endpoints

### POST /api/redact
Redacts PII from provided text using multiple detection methods.

**Request Body:**
```json
{
  "text": "Text to redact",
  "template": "optional-template-name",
  "confidenceThreshold": 0.7,
  "alwaysRedactWords": ["custom", "words"],
  "alwaysIgnoreWords": ["ignore", "words"]
}
```

**Response:**
```json
{
  "redacted": "Redacted text",
  "mapping": {"placeholder": "original-value"},
  "method": "processing-method-used",
  "entityCount": 5,
  "totalEntities": 7,
  "entities": [
    {
      "entity_group": "PERSON",
      "word": "John Doe",
      "start": 0,
      "end": 8,
      "score": 0.95
    }
  ],
  "confidenceThreshold": 0.7,
  "localModelsUsed": true
}
```

### POST /api/feedback
Submit feedback on PII detection accuracy.

**Request Body:**
```json
{
  "type": "false_positive|false_negative",
  "comment": "Optional comment about the feedback",
  "originalText": "Original text",
  "redactedText": "Redacted text"
}
```

## SmolLM3 Integration

The application integrates with SmolLM3 for enhanced PII detection and validation:

1. **Default URL**: The application uses `https://0b0747d71cf4.ngrok-free.app` as the default SmolLM3 endpoint
2. **Custom URL**: Set the `SMOLLM3_URL` environment variable to use a different endpoint
3. **Capabilities**:
   - Generation: Basic text generation
   - Validation: Contextual validation of redacted text
   - Entity Extraction: Additional NER capabilities

## Local Model Support

The application uses local JavaScript models for PII detection:
- Models are automatically downloaded and cached in the `models/` directory
- Supports both Piiranha (specialized PII) and BERT (general NER) models
- Works offline once models are downloaded
- Processes large documents using text chunking with overlap

## Feedback System

Help improve the redaction accuracy by reporting false positives or negatives:
- **False Positive**: Entity was redacted but shouldn't have been
- **False Negative**: Entity should have been redacted but wasn't
- Feedback is saved to `feedback/feedback.log` for model improvement
