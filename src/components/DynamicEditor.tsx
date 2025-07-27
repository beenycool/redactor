import React, { useCallback, useEffect, useRef } from 'react';
import { PIIEntity } from '@/lib/types';

interface DynamicEditorProps {
  content: string;
  onChange: (text: string) => void;
  placeholder?: string;
  entities?: PIIEntity[];
  readOnly?: boolean;
}

export const DynamicEditor: React.FC<DynamicEditorProps> = ({ 
  content, 
  onChange, 
  placeholder = "Enter text...",
  entities = [],
  readOnly = false
}) => {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleScroll = useCallback(() => {
    if (editorRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = editorRef.current.scrollTop;
      overlayRef.current.scrollLeft = editorRef.current.scrollLeft;
    }
  }, []);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!readOnly) {
      onChange(e.target.value);
    }
  }, [onChange, readOnly]);

  const renderHighlightedText = useCallback(() => {
    if (!content || entities.length === 0) {
      return content;
    }

    // Sort entities by start position
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    
    let result = '';
    let lastIndex = 0;

    sortedEntities.forEach((entity) => {
      // Add text before entity
      if (entity.start > lastIndex) {
        result += content.substring(lastIndex, entity.start);
      }

      // Add highlighted entity
      const entityText = content.substring(entity.start, entity.end);
      const colorClass = getEntityColor(entity.entity_group);
      result += `<span class="${colorClass} px-1 rounded-sm">${entityText}</span>`;

      lastIndex = entity.end;
    });

    // Add remaining text
    if (lastIndex < content.length) {
      result += content.substring(lastIndex);
    }

    return result;
  }, [content, entities]);

  const getEntityColor = (entityType: string): string => {
    const colors: Record<string, string> = {
      'PERSON': 'bg-red-200 text-red-800 border border-red-300',
      'ORGANIZATION': 'bg-blue-200 text-blue-800 border border-blue-300',
      'LOCATION': 'bg-green-200 text-green-800 border border-green-300',
      'DATE': 'bg-yellow-200 text-yellow-800 border border-yellow-300',
      'EMAIL': 'bg-purple-200 text-purple-800 border border-purple-300',
      'PHONE': 'bg-pink-200 text-pink-800 border border-pink-300',
      'CREDIT_CARD': 'bg-orange-200 text-orange-800 border border-orange-300',
      'SSN': 'bg-indigo-200 text-indigo-800 border border-indigo-300',
      'CUSTOM': 'bg-gray-200 text-gray-800 border border-gray-300',
    };
    return colors[entityType] || 'bg-gray-200 text-gray-800 border border-gray-300';
  };

  // Auto-resize textarea
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.style.height = 'auto';
      editorRef.current.style.height = `${Math.max(200, editorRef.current.scrollHeight)}px`;
    }
  }, [content]);

  return (
    <div className="relative w-full h-full">
      <div className="absolute inset-0">
        <textarea
          ref={editorRef}
          value={content}
          onChange={handleInput}
          onScroll={handleScroll}
          readOnly={readOnly}
          placeholder={placeholder}
          className="w-full h-full p-4 text-base font-mono resize-none border-0 focus:outline-none focus:ring-0 bg-transparent"
          style={{
            lineHeight: '1.6',
            fontSize: '14px',
            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
            color: entities.length > 0 ? 'transparent' : 'inherit',
            caretColor: '#000',
            backgroundColor: 'transparent',
            zIndex: 2,
            position: 'relative',
            minHeight: '200px'
          }}
        />
        
        {entities.length > 0 && (
          <div
            ref={overlayRef}
            className="absolute inset-0 p-4 text-base font-mono overflow-auto pointer-events-none"
            style={{
              lineHeight: '1.6',
              fontSize: '14px',
              fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", Menlo, monospace',
              whiteSpace: 'pre-wrap',
              wordWrap: 'break-word',
              color: '#000',
              backgroundColor: 'white',
              zIndex: 1,
              minHeight: '200px'
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: renderHighlightedText() }} />
          </div>
        )}
      </div>
    </div>
  );
};
