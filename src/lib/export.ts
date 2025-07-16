export interface ExportOptions {
  filename?: string;
  includeMetadata?: boolean;
}

export function exportAsText(content: string, options: ExportOptions = {}) {
  const filename = options.filename || `redacted-${new Date().toISOString().split('T')[0]}.txt`;
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportWithMetadata(content: string, metadata: Record<string, any>) {
  const header = Object.entries(metadata)
    .map(([key, value]) => `# ${key}: ${value}`)
    .join('\n');
  
  const fullContent = `${header}\n\n${content}`;
  exportAsText(fullContent, { 
    filename: `redacted-with-metadata-${new Date().toISOString().split('T')[0]}.txt` 
  });
}

export function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  } else {
    // Fallback for older browsers or non-secure contexts
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-9999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      document.execCommand('copy');
    } finally {
      document.body.removeChild(textArea);
    }
    
    return Promise.resolve();
  }
}