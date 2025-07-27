import React, { useState } from 'react';
import { X, Plus } from 'lucide-react';

interface WordListProps {
  title: string;
  words: string[];
  onAdd: (word: string) => void;
  onRemove: (word: string) => void;
  placeholder?: string;
}

export const WordList: React.FC<WordListProps> = ({ 
  title, 
  words, 
  onAdd, 
  onRemove, 
  placeholder = "Add word..." 
}) => {
  const [inputValue, setInputValue] = useState('');

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !words.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-sm font-medium text-gray-700">{title}</label>
        <span className="text-xs text-gray-500">{words.length} items</span>
      </div>
      
      <div className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder={placeholder}
        />
        <button
          onClick={handleAdd}
          disabled={!inputValue.trim()}
          className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      {words.length > 0 && (
        <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
          {words.map((word, index) => (
            <span 
              key={`${word}-${index}`}
              className="inline-flex items-center gap-1 px-2 py-1 text-sm bg-gray-100 text-gray-800 rounded-md border"
            >
              {word}
              <button 
                onClick={() => onRemove(word)}
                className="text-gray-500 hover:text-red-600 transition-colors"
                title={`Remove ${word}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
