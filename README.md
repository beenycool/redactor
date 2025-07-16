# PII Redactor for Court & Psychiatric Reports

A Next.js application designed to redact personally identifiable information (PII) from court reports and psychiatric reports using both remote HuggingFace API and local model processing.

## Features

- **2x2 Grid Layout**: Four text boxes for the complete redaction workflow
- **Dual Processing Options**: Remote API processing or local model inference
- **Specialized PII Categories**: Tailored for legal and medical contexts
- **Context-Aware Detection**: Enhanced patterns for court and psychiatric reports
- **Professional Interface**: Clean, light-mode design suitable for professional use

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the root directory:

```env
HF_TOKEN=your_huggingface_token_here
NEXT_PUBLIC_HF_TOKEN=your_huggingface_token_here
```

Get your HuggingFace token from: https://huggingface.co/settings/tokens

### 3. Run the Application

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Workflow

1. **Box 1 (Original Report)**: Paste your court report or psychiatric report
2. **Box 2 (Redacted Report)**: Click "Redact PII" to process the text
3. **Box 3 (Modified Text)**: Edit the redacted text as needed
4. **Box 4 (Restored Report)**: Click "Restore PII" to get the final text

### Processing Options

- **Remote Processing**: Uses HuggingFace API for PII detection
- **Local Processing**: Downloads and runs the model locally for enhanced privacy

## PII Categories

The application detects and redacts the following categories specifically tailored for legal and medical contexts:

- `<PII PERSON N>` - Patient names, defendant names, plaintiff names
- `<PII DOCTOR N>` - Doctor names, medical professionals
- `<PII JUDGE N>` - Judge names, court officials
- `<PII CASE_NUMBER N>` - Case numbers, docket numbers
- `<PII COURT N>` - Court names, legal institutions
- `<PII HOSPITAL N>` - Hospital names, medical facilities
- `<PII DATE N>` - Dates of birth, hearing dates
- `<PII PHONE N>` - Phone numbers
- `<PII EMAIL N>` - Email addresses
- `<PII ADDRESS N>` - Physical addresses
- `<PII MEDICATION N>` - Medications, prescriptions
- `<PII DIAGNOSIS N>` - Medical diagnoses

## Technical Details

### Dependencies

- **Next.js 15** with TypeScript
- **@huggingface/inference** - Remote API processing
- **@xenova/transformers** - Local model processing
- **Tailwind CSS** - Styling

### Model

Uses the `iiiorg/piiranha-v1-detect-personal-information` model for PII detection.

### Local Model Storage

Local models are cached in the `./models` directory for offline processing.

## Privacy & Security

- **Local Processing**: Run models entirely offline for sensitive documents
- **No Data Storage**: All processing happens in memory
- **Client-Side State**: PII mappings are stored only in the browser session

## Development

### Build

```bash
npm run build
```

### Lint

```bash
npm run lint
```

### Type Check

```bash
npm run type-check
```

## Contributing

This tool is designed for defensive security purposes to help protect personally identifiable information in legal and medical documents.

## License

MIT License
