// Consolidated PII patterns for the redactor application
// This file contains all regex patterns used for PII detection across the application

export interface PIIPattern {
  name: string;
  pattern: RegExp;
  category: string;
  description?: string;
  validator?: (match: string) => boolean;
}

// Basic fallback patterns used in local model processing
export const BASIC_PII_PATTERNS: PIIPattern[] = [
  {
    name: 'Email Address',
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    category: 'EMAIL',
    description: 'Standard email address format'
  },
  {
    name: 'Phone Number',
    pattern: /(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    category: 'PHONE',
    description: 'US phone number formats'
  },
  {
    name: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: 'SSN',
    description: 'US Social Security Number format'
  },
  {
    name: 'Credit Card Number',
    pattern: /\b(?:\d{4}[-\s]?){3}\d{4}\b/g,
    category: 'CREDIT_CARD',
    description: 'Basic credit card number pattern'
  },
  {
    name: 'Person Name',
    pattern: /\b[A-Z][a-z]+ [A-Z][a-z]+\b/g,
    category: 'PERSON',
    description: 'Basic person name pattern (First Last)'
  }
];

// Enhanced patterns for context-based extraction (from API route)
export const CONTEXT_PII_PATTERNS: PIIPattern[] = [
  {
    name: 'Person with Title',
    pattern: /\b(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?|Prof\.?|Judge|Justice)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g,
    category: 'PERSON',
    description: 'Names with titles'
  },
  {
    name: 'Full Name',
    pattern: /\b[A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+\b/g,
    category: 'PERSON',
    description: 'Full names (2-3 word combinations starting with capitals)'
  },
  {
    name: 'Email Address',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    category: 'EMAIL',
    description: 'Email addresses'
  },
  {
    name: 'Phone Number 1',
    pattern: /\b(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g,
    category: 'PHONE',
    description: 'Phone numbers (various formats)'
  },
  {
    name: 'Phone Number 2',
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    category: 'PHONE',
    description: 'Alternative phone number format'
  },
  {
    name: 'Address',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl|Boulevard|Blvd)\b/gi,
    category: 'ADDRESS',
    description: 'Street addresses'
  },
  {
    name: 'Social Security Number',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    category: 'SSN',
    description: 'SSN format'
  },
  {
    name: 'Date Format 1',
    pattern: /\b(?:0?[1-9]|1[0-2])[\/\-](?:0?[1-9]|[12]\d|3[01])[\/\-](?:19|20)\d{2}\b/g,
    category: 'DATE',
    description: 'Dates in numeric format'
  },
  {
    name: 'Date Format 2',
    pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    category: 'DATE',
    description: 'Dates in text format'
  },
  {
    name: 'Medication',
    pattern: /\b(?:prescribed|taking|medication:?)\s+([A-Z][a-z]+(?:\s+\d+mg)?)\b/gi,
    category: 'MEDICATION',
    description: 'Medical specific - medications'
  },
  {
    name: 'Diagnosis',
    pattern: /\b(?:diagnosed\s+with|diagnosis:?)\s+([A-Za-z\s]+)\b/gi,
    category: 'DIAGNOSIS',
    description: 'Medical specific - diagnoses'
  },
  {
    name: 'Case Number',
    pattern: /\b(?:Case\s+No\.?|Case\s+Number|Docket)\s*:?\s*([A-Z0-9-]+)\b/gi,
    category: 'CASE_NUMBER',
    description: 'Legal specific - case numbers'
  },
  {
    name: 'Legal Party',
    pattern: /\b(?:Plaintiff|Defendant|Petitioner|Respondent)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    category: 'PARTY',
    description: 'Legal specific - parties'
  },
  {
    name: 'Organization',
    pattern: /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Hospital|Clinic|Medical Center|Court|University|College|Corporation|Inc|LLC|LLP)\b/g,
    category: 'ORGANIZATION',
    description: 'Organizations and institutions'
  },
  {
    name: 'Credit Card',
    pattern: /\b(?:\d{4}[\s\-]?){3}\d{4}\b/g,
    category: 'CREDIT_CARD',
    description: 'Credit card numbers'
  },
  {
    name: 'IP Address',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    category: 'IP_ADDRESS',
    description: 'IP addresses'
  }
];

// Validation patterns ported from Python service (PII_VALIDATION_PATTERNS)
export const VALIDATION_PII_PATTERNS: PIIPattern[] = [
  {
    name: 'Person with Title',
    pattern: /\b(?:Mr\.?|Mrs\.?|Ms\.?|Miss|Dr\.?)\s+[A-Z][a-z]+\b/gi,
    category: 'PERSON_TITLE',
    description: 'Names with titles that might have been missed'
  },
  {
    name: 'Person Name',
    pattern: /\b[A-Z][a-z]{2,}\s+[A-Z][a-z]{2,}\b/g,
    category: 'PERSON_NAME',
    description: 'Person names'
  },
  {
    name: 'Full Name',
    pattern: /\b[A-Z][a-z]+(?:\s[A-Z][a-z]+){1,2}\b/g,
    category: 'FULL_NAME',
    description: 'Full names'
  },
  {
    name: 'Phone Number',
    pattern: /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
    category: 'PHONE',
    description: 'Phone numbers'
  },
  {
    name: 'Email Address',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    category: 'EMAIL',
    description: 'Email addresses'
  },
  {
    name: 'Address',
    pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Court|Ct|Place|Pl)\b/gi,
    category: 'ADDRESS',
    description: 'Addresses'
  },
  {
    name: 'Date Format 1',
    pattern: /\b(?:0?[1-9]|1[0-2])[/.-](?:0?[1-9]|[12]\d|3[01])[/.-](?:19|20)\d{2}\b/g,
    category: 'DATE',
    description: 'Dates that might contain birthdates'
  },
  {
    name: 'Date Format 2',
    pattern: /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
    category: 'DATE',
    description: 'Text format dates'
  },
  {
    name: 'Social Security Number',
    pattern: /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g,
    category: 'SSN',
    description: 'Enhanced SSN format with validation for area/group/serial numbers'
  },
  {
    name: 'ID Number',
    pattern: /\b[A-Z]{1,2}\d{6,8}\b|\b\d{2}[A-Z]{2}\d{4}\b|\b[A-Z]\d{8}\b/g,
    category: 'ID_NUMBER',
    description: 'Differentiated ID numbers (driver\'s license, employee ID) with specific formats'
  },
  {
    name: 'Person with Role',
    pattern: /\b(?:patient|client|defendant|plaintiff)\s+[A-Z][a-z]+\b/gi,
    category: 'PERSON_ROLE',
    description: 'Person with role identifiers'
  },
  {
    name: 'Case Number',
    pattern: /\b(?:case|docket)\s*(?:no\.?|number)?\s*:?\s*[A-Za-z0-9-]+\b/gi,
    category: 'CASE_NUMBER',
    description: 'Legal case numbers'
  },
  {
    name: 'Organization',
    pattern: /\b[A-Z][a-z]+\s+(?:Hospital|Clinic|Medical Center|Court|University|College)\b/g,
    category: 'ORGANIZATION',
    description: 'Organizations and locations'
  },
  {
    name: 'Location',
    pattern: /\b[A-Z][a-z]+,\s*[A-Z]{2}\b/g,
    category: 'LOCATION',
    description: 'City, State format locations'
  },
  {
    name: 'Credit Card',
    pattern: /\b(?:\d{4}[\s-]?){3}\d{4}\b/g,
    category: 'CREDIT_CARD',
    description: 'Credit card numbers with Luhn algorithm validation',
    validator: (match: string) => {
      // Luhn algorithm for credit card validation
      const cardNumber = match.replace(/[\s-]/g, '');
      if (!/^\d{13,19}$/.test(cardNumber)) return false;
      
      let sum = 0;
      let isEven = false;
      
      for (let i = cardNumber.length - 1; i >= 0; i--) {
        let digit = parseInt(cardNumber.charAt(i), 10);
        
        if (isEven) {
          digit *= 2;
          if (digit > 9) {
            digit = Math.floor(digit / 10) + (digit % 10);
          }
        }
        
        sum += digit;
        isEven = !isEven;
      }
      
      return sum % 10 === 0;
    }
  },
  {
    name: 'Account Number',
    pattern: /\b\d{8,12}\b/g,
    category: 'ACCOUNT_NUMBER',
    description: 'Account numbers with additional validation',
    validator: (match: string) => {
      // Additional validation to reduce false positives
      const accountNumber = match.replace(/[\s-]/g, '');
      if (accountNumber.length < 8 || accountNumber.length > 12) return false;
      
      // Check for obvious sequential patterns
      const sequentialPatterns = ['12345678', '87654321', '00000000', '11111111', '22222222'];
      if (sequentialPatterns.includes(accountNumber)) return false;
      
      // Check if all digits are the same
      if (new Set(accountNumber).size === 1) return false;
      
      return true;
    }
  }
];

// All patterns combined for comprehensive validation
export const ALL_PII_PATTERNS: PIIPattern[] = [
  ...BASIC_PII_PATTERNS,
  ...CONTEXT_PII_PATTERNS,
  ...VALIDATION_PII_PATTERNS
];

// Function to detect PII using patterns
export function detectPIIWithPatterns(text: string, patterns: PIIPattern[]): any[] {
  const entities: any[] = [];
  const processedRanges: Array<{start: number, end: number}> = [];
  
  for (const { pattern, category, name, validator } of patterns) {
    // Reset regex lastIndex to avoid issues with global flag
    pattern.lastIndex = 0;
    const matches = Array.from(text.matchAll(pattern));
    
    for (const match of matches) {
      if (match.index === undefined) continue;
      
      // Apply additional validation if validator function exists
      if (validator && !validator(match[0])) {
        continue; // Skip invalid matches
      }
      
      const start = match.index;
      const end = start + match[0].length;
      
      // Check if this range overlaps with already processed entities
      const overlaps = processedRanges.some(range =>
        start < range.end && end > range.start
      );
      
      if (!overlaps) {
        entities.push({
          entity_group: category,
          label: name,
          word: match[0],
          start,
          end,
          score: 0.85 // Pattern-based extraction confidence
        });
        processedRanges.push({ start, end });
      }
    }
  }
  
  return entities;
}