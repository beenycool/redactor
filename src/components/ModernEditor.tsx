import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Play, RotateCcw, Redo2, Undo2 } from 'lucide-react';

interface PIIEntity {
  entity_group: string;
  word: string;
  start: number;
  end: number;
  score: number;
}

interface ModernEditorProps {
  originalText: string;
  setOriginalText: (text: string) => void;
  onRedact: () => void;
  isProcessing: boolean;
  isRedactDisabled: boolean;
  redactedEntities: PIIEntity[];
  onEntityClick?: (entity: PIIEntity) => void;
  confidenceThreshold?: number;
  onConfidenceThresholdChange?: (threshold: number) => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}

export const ModernEditor: React.FC<ModernEditorProps> = ({
  originalText,
  setOriginalText,
  onRedact,
  isProcessing,
  isRedactDisabled,
  redactedEntities,
  onEntityClick,
  confidenceThreshold = 0.7,
  onConfidenceThresholdChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo
}) => {
  const [hoveredEntity, setHoveredEntity] = useState<PIIEntity | null>(null);
  const [acceptedEntities, setAcceptedEntities] = useState<Set<string>>(new Set());
  const [focusedEntityIndex, setFocusedEntityIndex] = useState<number>(-1);
  const entityRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Create Tiptap editor instance
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Paste your document here...',
      }),
    ],
    content: originalText,
    onUpdate: ({ editor }) => {
      setOriginalText(editor.getText());
    },
    editorProps: {
      attributes: {
        class: 'min-h-64 p-2 border border-gray-200 rounded bg-white font-mono text-sm leading-relaxed focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none transition-colors hover:border-gray-300',
      },
    },
  });

  // Update editor content when originalText changes from outside
  useEffect(() => {
    if (editor && editor.getText() !== originalText) {
      editor.commands.setContent(originalText);
    }
  }, [originalText, editor]);

  // Reset focused entity when text changes
  useEffect(() => {
    setFocusedEntityIndex(-1);
    entityRefs.current = [];
  }, [originalText]);

  // Reset accepted entities when text changes
  useEffect(() => {
    setAcceptedEntities(new Set());
  }, [originalText]);

  const handleAcceptEntity = (entity: PIIEntity) => {
    const entityKey = `${entity.start}-${entity.end}-${entity.entity_group}`;
    setAcceptedEntities(prev => new Set(prev).add(entityKey));
  };

  const handleIgnoreEntity = (entity: PIIEntity) => {
    const entityKey = `${entity.start}-${entity.end}-${entity.entity_group}`;
    setAcceptedEntities(prev => {
      const newSet = new Set(prev);
      newSet.delete(entityKey);
      return newSet;
    });
  };

  const isEntityAccepted = (entity: PIIEntity) => {
    const entityKey = `${entity.start}-${entity.end}-${entity.entity_group}`;
    return acceptedEntities.has(entityKey);
  };

  const renderTextWithHighlights = () => {
    if (!originalText) {
      return <span className="text-gray-500">Paste your document here...</span>;
    }

    if (redactedEntities.length === 0) {
      return <span>{originalText}</span>;
    }

    // Sort entities by start position
    const sortedEntities = [...redactedEntities].sort((a, b) => a.start - b.start);
    
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;

    sortedEntities.forEach((entity, index) => {
      // Add text before entity
      if (entity.start > lastIndex) {
        elements.push(
          <span key={`text-${lastIndex}`}>
            {originalText.substring(lastIndex, entity.start)}
          </span>
        );
      }

      // Add highlighted entity
      const isAccepted = isEntityAccepted(entity);
      const isHovered = hoveredEntity?.start === entity.start && hoveredEntity?.end === entity.end;
      const isLowConfidence = entity.score < confidenceThreshold;
      
      elements.push(
        <span
          key={`entity-${entity.start}-${entity.end}`}
          ref={(el) => { entityRefs.current[index] = el; }}
          tabIndex={0}
          className={`
            relative cursor-pointer px-0.5 rounded-sm text-sm transition-all duration-150 outline-none
            ${isAccepted
              ? 'bg-red-100 border border-red-300 text-red-800 hover:bg-red-200'
              : isLowConfidence
              ? 'bg-yellow-50 border border-yellow-300 border-dashed text-yellow-800 hover:bg-yellow-100'
              : 'bg-yellow-100 border border-yellow-400 text-yellow-800 hover:bg-yellow-200'
            }
            ${isHovered ? 'ring-1 ring-blue-400 shadow-sm' : ''}
            ${focusedEntityIndex === index ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
          `}
          onMouseEnter={() => setHoveredEntity(entity)}
          onMouseLeave={() => setHoveredEntity(null)}
          onFocus={() => setFocusedEntityIndex(index)}
          title={`${entity.entity_group} (${Math.round(entity.score * 100)}%)${isLowConfidence ? ' - Low Confidence' : ''}`}
        >
          {originalText.substring(entity.start, entity.end)}
          
          {/* Compact Tooltip */}
          {(isHovered || focusedEntityIndex === index) && (
            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-1.5 z-10">
              <div className="bg-gray-800 text-white text-xs rounded py-1 px-2 whitespace-nowrap shadow-md">
                <div className="font-semibold flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${
                    isAccepted ? 'bg-red-400' : isLowConfidence ? 'bg-yellow-400' : 'bg-yellow-500'
                  }`}></div>
                  {entity.entity_group}
                </div>
                <div className="text-gray-300 mt-0.5">{Math.round(entity.score * 100)}% confidence</div>
              </div>
            </div>
          )}
        </span>
      );

      lastIndex = entity.end;
    });

    // Add remaining text
    if (lastIndex < originalText.length) {
      elements.push(
        <span key={`text-${lastIndex}`}>
          {originalText.substring(lastIndex)}
        </span>
      );
    }

    return elements;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={onRedact}
            disabled={isRedactDisabled || isProcessing}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors
              ${isRedactDisabled || isProcessing
                ? 'bg-gray-100 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
              }
            `}
          >
            <Play className="w-4 h-4" />
            {isProcessing ? 'Processing...' : 'Redact'}
          </button>
          
          <div className="h-4 w-px bg-gray-300"></div>
          
          <div className="flex gap-1">
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className={`
                p-1.5 rounded-md transition-colors
                ${!canUndo
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-200'
                }
              `}
              title="Undo"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className={`
                p-1.5 rounded-md transition-colors
                ${!canRedo
                  ? 'text-gray-400 cursor-not-allowed'
                  : 'text-gray-700 hover:bg-gray-200'
                }
              `}
              title="Redo"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="text-xs text-gray-600 font-medium">
          {originalText.length.toLocaleString()} characters
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 overflow-hidden">
        {editor ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500">
            Loading...
          </div>
        )}
      </div>

      {/* Entity Preview */}
      {redactedEntities.length > 0 && (
        <div className="border-t border-gray-200 bg-gray-50 px-3 py-1.5">
          <div className="text-xs text-gray-700 flex items-center">
            <span className="font-medium">
              {redactedEntities.length} entities detected
            </span>
            {acceptedEntities.size > 0 && (
              <span className="ml-2 bg-red-100 text-red-800 px-2 py-0.5 rounded-full">
                {acceptedEntities.size} selected
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
