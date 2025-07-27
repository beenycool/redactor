import { RedactionOptions, RedactionResult } from './types';

export async function redactText(options: RedactionOptions): Promise<RedactionResult> {
  const response = await fetch('/api/redact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    throw new Error(`Redaction failed: ${response.statusText}`);
  }

  return response.json();
}