/**
 * Restores PII (Personally Identifiable Information) in redacted text using a mapping object.
 * @param redactedText - The text with PII redacted
 * @param mapping - Object mapping placeholders to original values
 * @returns The text with PII restored
 * @throws Error if inputs are invalid or if there are issues with placeholder formatting
 */
export function restorePII(redactedText: string, mapping: Record<string, string>): string {
  // Input validation
  if (redactedText === null || redactedText === undefined) {
    throw new Error('Redacted text cannot be null or undefined');
  }
  
  if (typeof redactedText !== 'string') {
    throw new Error('Redacted text must be a string');
  }
  
  if (mapping === null || mapping === undefined) {
    throw new Error('Mapping cannot be null or undefined');
  }
  
  if (typeof mapping !== 'object' || Array.isArray(mapping)) {
    throw new Error('Mapping must be an object');
  }
  
  // Handle edge cases
  if (redactedText === '') {
    return '';
  }
  
  if (Object.keys(mapping).length === 0) {
    // No mapping provided, return original text
    return redactedText;
  }
  
  // Audit logging for PII restoration
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const restorationLog = {
        timestamp: new Date().toISOString(),
        textLength: redactedText.length,
        mappingCount: Object.keys(mapping).length,
        userAgent: navigator.userAgent,
        url: window.location.href
      };
      
      // Log to console for development
      console.log('[AUDIT] PII restoration requested:', restorationLog);
      
      // Store in localStorage for audit trail (in a real app, this would go to a secure log server)
      const auditLogs = JSON.parse(localStorage.getItem('pii-restoration-logs') || '[]');
      auditLogs.push(restorationLog);
      // Keep only the last 100 logs to prevent storage bloat
      if (auditLogs.length > 100) {
        auditLogs.shift();
      }
      localStorage.setItem('pii-restoration-logs', JSON.stringify(auditLogs));
    } catch (error) {
      // Silently fail audit logging to not break the main functionality
      console.warn('Failed to log PII restoration audit trail:', error);
    }
  }
  
  let restoredText = redactedText;
  
  // Sort placeholders by length (descending) to avoid partial replacements
  const sortedPlaceholders = Object.keys(mapping).sort((a, b) => b.length - a.length);
  
  for (const placeholder of sortedPlaceholders) {
    const originalValue = mapping[placeholder];
    
    // Validate placeholder and original value
    if (typeof placeholder !== 'string' || typeof originalValue !== 'string') {
      throw new Error('All mapping keys and values must be strings');
    }
    
    // Skip empty placeholders or values
    if (placeholder === '' || originalValue === '') {
      continue;
    }
    
    // Ensure placeholder is well-formed for regex
    // Check if placeholder contains valid characters for a placeholder
    if (!/^<PII [A-Z_]+ \d+>$/.test(placeholder)) {
      console.warn(`Skipping invalid placeholder format: ${placeholder}`);
      continue;
    }
    
    try {
      // Escape special regex characters in placeholder
      const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Use global replacement to replace all instances
      const regex = new RegExp(escapedPlaceholder, 'g');
      restoredText = restoredText.replace(regex, originalValue);
    } catch (error) {
      // If regex creation fails, log warning and skip this placeholder
      console.warn(`Failed to process placeholder ${placeholder}:`, error);
      continue;
    }
  }
  
  return restoredText;
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

export function downloadTextAsFile(content: string, filename: string): void {
  // Input validation
  if (!content) {
    throw new Error('Content cannot be empty');
  }
  
  if (!filename) {
    throw new Error('Filename cannot be empty');
  }
  
  // Content size limit (100MB)
  const maxSize = 100 * 1024 * 1024; // 100MB in bytes
  if (content.length > maxSize) {
    throw new Error('Content size exceeds maximum allowed size of 100MB');
  }
  
  // Filename sanitization
  let sanitizedFilename = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_') // Replace invalid characters with underscore
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .trim(); // Remove leading/trailing whitespace
  
  // Ensure filename is not empty after sanitization
  if (!sanitizedFilename) {
    sanitizedFilename = 'download';
  }
  
  // SSR compatibility check
  if (typeof document === 'undefined') {
    throw new Error('This function can only be used in a browser environment');
  }
  
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizedFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}