export interface RedactionTemplate {
  name: string;
  description: string;
  categories: string[];
  patterns: {
    name: string;
    pattern: RegExp;
    category: string;
  }[];
}

export const redactionTemplates: Record<string, RedactionTemplate> = {
  court: {
    name: 'Court Documents',
    description: 'Standard redaction for legal documents',
    categories: ['JUDGE', 'CASE_NUMBER', 'PLAINTIFF', 'DEFENDANT', 'ATTORNEY', 'COURT_NAME'],
    patterns: [
      { name: 'Case Number', pattern: /(?:Case\s+No\.?|Case\s+Number)\s*:?\s*([A-Z0-9-]+)/gi, category: 'CASE_NUMBER' },
      { name: 'Judge Name', pattern: /(?:Judge|Justice)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'JUDGE' },
      { name: 'Attorney', pattern: /(?:Attorney|Counsel|Represented\s+by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'ATTORNEY' }
    ]
  },
  medical: {
    name: 'Medical Records',
    description: 'HIPAA-compliant medical document redaction',
    categories: ['DOCTOR', 'PATIENT', 'DIAGNOSIS', 'MEDICATION', 'HOSPITAL', 'MRN'],
    patterns: [
      { name: 'Doctor Name', pattern: /(?:Dr\.?|Doctor)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'DOCTOR' },
      { name: 'Patient Name', pattern: /(?:Patient|Mr\.?|Mrs\.?|Ms\.?)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'PATIENT' },
      { name: 'Medication', pattern: /\b(?:prescribed|taking|medication:?)\s+([A-Z][a-z]+(?:\s+\d+mg)?)/g, category: 'MEDICATION' },
      { name: 'MRN', pattern: /(?:MRN|Medical\s+Record\s+Number)\s*:?\s*(\d+)/gi, category: 'MRN' }
    ]
  },
  minimal: {
    name: 'Basic PII',
    description: 'Essential PII redaction only',
    categories: ['PERSON', 'PHONE', 'EMAIL', 'SSN'],
    patterns: [
      { name: 'Phone Number', pattern: /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g, category: 'PHONE' },
      { name: 'Email', pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, category: 'EMAIL' },
      { name: 'SSN', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, category: 'SSN' }
    ]
  },
  psychiatric: {
    name: 'Psychiatric Reports',
    description: 'Mental health document redaction',
    categories: ['THERAPIST', 'PATIENT', 'DIAGNOSIS', 'MEDICATION', 'FACILITY'],
    patterns: [
      { name: 'Therapist', pattern: /(?:Therapist|Psychiatrist|Psychologist)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'THERAPIST' },
      { name: 'Facility', pattern: /(?:Hospital|Clinic|Center|Facility)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, category: 'FACILITY' },
      { name: 'Diagnosis', pattern: /(?:diagnosed\s+with|diagnosis:?)\s+([A-Z][a-z]+(?:\s+disorder)?)/gi, category: 'DIAGNOSIS' }
    ]
  }
};

export function getTemplateNames(): string[] {
  return Object.keys(redactionTemplates);
}

export function getTemplate(name: string): RedactionTemplate | undefined {
  return redactionTemplates[name];
}