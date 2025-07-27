import React, { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';

interface CompactWordListProps {
  onAlwaysRedactChange: (words: string[]) => void;
  onAlwaysIgnoreChange: (words: string[]) => void;
  alwaysRedactWords: string[];
  alwaysIgnoreWords: string[];
}

export const CompactWordLists: React.FC<CompactWordListProps> = ({
  onAlwaysRedactChange,
  onAlwaysIgnoreChange,
  alwaysRedactWords,
  alwaysIgnoreWords
}) => {
  const [localAlwaysRedact, setLocalAlwaysRedact] = useState<string[]>(alwaysRedactWords);
  const [localAlwaysIgnore, setLocalAlwaysIgnore] = useState<string[]>(alwaysIgnoreWords);
  const [newRedactWord, setNewRedactWord] = useState('');
  const [newIgnoreWord, setNewIgnoreWord] = useState('');

  useEffect(() => {
    setLocalAlwaysRedact(alwaysRedactWords);
    setLocalAlwaysIgnore(alwaysIgnoreWords);
  }, [alwaysRedactWords, alwaysIgnoreWords]);

  const handleAddRedactWord = () => {
    if (newRedactWord.trim() && !localAlwaysRedact.includes(newRedactWord.trim())) {
      const updatedList = [...localAlwaysRedact, newRedactWord.trim()];
      setLocalAlwaysRedact(updatedList);
      onAlwaysRedactChange(updatedList);
      setNewRedactWord('');
    }
  };

  const handleAddIgnoreWord = () => {
    if (newIgnoreWord.trim() && !localAlwaysIgnore.includes(newIgnoreWord.trim())) {
      const updatedList = [...localAlwaysIgnore, newIgnoreWord.trim()];
      setLocalAlwaysIgnore(updatedList);
      onAlwaysIgnoreChange(updatedList);
      setNewIgnoreWord('');
    }
  };

  const handleRemoveRedactWord = (word: string) => {
    const updatedList = localAlwaysRedact.filter(w => w !== word);
    setLocalAlwaysRedact(updatedList);
    onAlwaysRedactChange(updatedList);
  };

  const handleRemoveIgnoreWord = (word: string) => {
    const updatedList = localAlwaysIgnore.filter(w => w !== word);
    setLocalAlwaysIgnore(updatedList);
    onAlwaysIgnoreChange(updatedList);
  };

  const handleKeyDown = (e: React.KeyboardEvent, handler: () => void) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handler();
    }
  };

  return (
    <div className="space-y-3">
      {/* Always Redact */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Always Redact</label>
          <span className="text-xs text-gray-500">{localAlwaysRedact.length}</span>
        </div>
        <div className="flex gap-1 mb-1">
          <input
            type="text"
            value={newRedactWord}
            onChange={(e) => setNewRedactWord(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleAddRedactWord)}
            placeholder="Add word..."
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:border-red-500 focus:outline-none"
          />
          <button
            onClick={handleAddRedactWord}
            disabled={!newRedactWord.trim()}
            className="p-1 text-red-600 hover:bg-red-50 rounded disabled:text-gray-300"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="max-h-16 overflow-y-auto">
          {localAlwaysRedact.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {localAlwaysRedact.map((word, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-1.5 py-0.5 bg-red-100 text-red-800 text-xs rounded"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveRedactWord(word)}
                    className="ml-1 text-red-600 hover:text-red-800"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">None</p>
          )}
        </div>
      </div>

      {/* Always Ignore */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <label className="text-xs font-medium text-gray-700">Always Ignore</label>
          <span className="text-xs text-gray-500">{localAlwaysIgnore.length}</span>
        </div>
        <div className="flex gap-1 mb-1">
          <input
            type="text"
            value={newIgnoreWord}
            onChange={(e) => setNewIgnoreWord(e.target.value)}
            onKeyDown={(e) => handleKeyDown(e, handleAddIgnoreWord)}
            placeholder="Add word..."
            className="flex-1 px-2 py-1 text-xs border border-gray-300 rounded focus:border-green-500 focus:outline-none"
          />
          <button
            onClick={handleAddIgnoreWord}
            disabled={!newIgnoreWord.trim()}
            className="p-1 text-green-600 hover:bg-green-50 rounded disabled:text-gray-300"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="max-h-16 overflow-y-auto">
          {localAlwaysIgnore.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {localAlwaysIgnore.map((word, index) => (
                <span
                  key={index}
                  className="inline-flex items-center px-1.5 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                >
                  {word}
                  <button
                    onClick={() => handleRemoveIgnoreWord(word)}
                    className="ml-1 text-green-600 hover:text-green-800"
                  >
                    <X className="w-2 h-2" />
                  </button>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-400 italic">None</p>
          )}
        </div>
      </div>
    </div>
  );
};