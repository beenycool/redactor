export interface SessionData {
  originalText: string;
  redactedText: string;
  modifiedText: string;
  restoredText?: string;
  piiMapping: Record<string, string>;
  timestamp: string;
  processingTime?: number;
  piiCounts?: Record<string, number>;
}

export interface SessionManager {
  save: (data: SessionData) => void;
  load: () => SessionData | null;
  clear: () => void;
  hasSavedSession: () => boolean;
}

const STORAGE_KEY = 'redactor-session';
const AUTO_SAVE_KEY = 'redactor-auto-save';

export const sessionManager: SessionManager = {
  save: (data: SessionData) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_error) {
      console.error('Failed to save session:', _error);
    }
  },

  load: (): SessionData | null => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch (_error) {
      console.error('Failed to load session:', _error);
      return null;
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(AUTO_SAVE_KEY);
    } catch (_error) {
      console.error('Failed to clear session:', _error);
    }
  },

  hasSavedSession: (): boolean => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false;
    }
  }
};

export const autoSaveManager = {
  save: (data: Partial<SessionData>) => {
    try {
      localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify({
        ...data,
        timestamp: new Date().toISOString()
      }));
    } catch (_error) {
      console.error('Failed to auto-save:', _error);
    }
  },

  load: (): Partial<SessionData> | null => {
    try {
      const saved = localStorage.getItem(AUTO_SAVE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  },

  clear: () => {
    try {
      localStorage.removeItem(AUTO_SAVE_KEY);
    } catch (_error) {
      console.error('Failed to clear auto-save:', _error);
    }
  }
};