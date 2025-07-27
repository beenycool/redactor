import React, { useState, useRef, useEffect } from 'react';

interface CompactEditorProps {
  text: string;
  onTextChange: (newText: string) => void;
  entities: any[];
  readOnly?: boolean;
  placeholder?: string;
}

export const CompactEditor: React.FC<CompactEditorProps> = ({
  text,
  onTextChange,
  entities,
  readOnly = false,
  placeholder = 'Enter text...'
}) => {
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (textareaRef.current && overlayRef.current) {
      overlayRef.current.scrollTop = textareaRef.current.scrollTop;
      overlayRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!readOnly) {
      onTextChange(e.target.value);
    }
  };

  const handleCompositionStart = () => setIsComposing(true);
  const handleCompositionEnd = () => setIsComposing(false);

  const renderHighlightedText = () => {
    if (!text || entities.length === 0) {
      return text;
    }

    // Sort entities by start position
    const sortedEntities = [...entities].sort((a, b) => a.start - b.start);
    
    let result = '';
    let lastIndex = 0;

    sortedEntities.forEach((entity) => {
      // Add text before entity
      if (entity.start > lastIndex) {
        result += text.substring(lastIndex, entity.start);
      }

      // Add highlighted entity
      const entityText = text.substring(entity.start, entity.end);
      const colorClass = getEntityColor(entity.entity_group);
      result += `<span class="${colorClass} px-0.5 rounded text-xs">${entityText}</span>`;

      lastIndex = entity.end;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      result += text.substring(lastIndex);
    }

    return result;
  };

  const getEntityColor = (entityType: string) => {
    const colors: Record<string, string> = {
      'PERSON': 'bg-red-200 text-red-800',
      'ORGANIZATION': 'bg-blue-200 text-blue-800',
      'LOCATION': 'bg-green-200 text-green-800',
      'DATE': 'bg-yellow-200 text-yellow-800',
      'EMAIL': 'bg-purple-200 text-purple-800',
      'PHONE': 'bg-pink-200 text-pink-800',
      'CREDIT_CARD': 'bg-orange-200 text-orange-800',
      'SSN': 'bg-indigo-200 text-indigo-800',
    };
    return colors[entityType] || 'bg-gray-200 text-gray-800';
  };

  return (
    <div className="relative h-full">
      <div className="absolute inset-0">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onScroll={handleScroll}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          readOnly={readOnly}
          placeholder={placeholder}
          className="w-full h-full p-3 text-sm font-mono resize-none border-0 focus:outline-none focus:ring-0 bg-transparent"
          style={{
            lineHeight: '1.5',
            fontSize: '14px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            color: 'transparent',
            caretColor: 'black',
            backgroundColor: 'transparent',
            zIndex: 2,
            position: 'relative'
          }}
        />
        
        <div
          ref={overlayRef}
          className="absolute inset-0 p-3 text-sm font-mono overflow-auto pointer-events-none"
          style={{
            lineHeight: '1.5',
            fontSize: '14px',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            color: 'black',
            backgroundColor: 'white',
            zIndex: 1
          }}
        >
          <div dangerouslySetInnerHTML={{ __html: renderHighlightedText() }} />
        </div>
      </div>
    </div>
  );
};