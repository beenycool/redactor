# PII Redactor App

A Next.js app that redacts personal info from court/psychiatric reports using HuggingFace API or local processing.

## What it does

- Uses 4 text boxes for redaction workflow
- Processes text either remotely (HuggingFace) or locally
- Detects legal/medical PII like names, case numbers, addresses

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env.local` file with:
```env
HF_TOKEN=your_huggingface_token
NEXT_PUBLIC_HF_TOKEN=your_huggingface_token
```
Get token from: https://huggingface.co/settings/tokens

3. Run the app:
```bash
npm run dev
```
Visit http://localhost:3000

## How to use

1. Paste report in Box 1
2. Click "Redact PII" to see results in Box 2
3. Edit redacted text in Box 3
4. Click "Restore PII" in Box 4 for final text

## Tech used

- Next.js with TypeScript
- HuggingFace inference API
- Xenova transformers for local processing
- Tailwind CSS styling

## PII categories detected

- Names (people, doctors, judges)
- Case numbers, court names
- Hospitals, dates, phones
- Emails, addresses
- Medications, diagnoses
