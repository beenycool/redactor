export interface FileUploadResult {
  text: string;
  filename: string;
  type: string;
}

export class FileUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileUploadError';
  }
}

export async function handleFileUpload(file: File): Promise<FileUploadResult> {
  if (!file) {
    throw new FileUploadError('No file provided');
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new FileUploadError('File size exceeds 10MB limit');
  }

  const allowedTypes = [
    'text/plain',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new FileUploadError('Unsupported file type. Please use .txt, .pdf, or .docx files');
  }

  try {
    if (file.type === 'text/plain') {
      const text = await file.text();
      return { text, filename: file.name, type: 'text' };
    }

    if (file.type === 'application/pdf') {
      // For PDF, we'll use a simple text extraction approach
      // In a real implementation, you'd use pdf.js
      throw new FileUploadError('PDF support requires additional setup. Please use text files for now.');
    }

    if (file.type.includes('word')) {
      // For Word docs, we'd use mammoth.js
      throw new FileUploadError('Word document support requires additional setup. Please use text files for now.');
    }

    throw new FileUploadError('Unsupported file type');
  } catch (error) {
    if (error instanceof FileUploadError) {
      throw error;
    }
    throw new FileUploadError('Failed to read file');
  }
}

export function createFileInput(): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.txt,.pdf,.docx,.doc';
  input.style.display = 'none';
  return input;
}