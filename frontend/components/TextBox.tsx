import React from 'react';

interface TextBoxProps {
  title: string;
  content: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  highlightRedactions?: boolean;
  loading?: boolean;
}

const TextBox: React.FC<TextBoxProps> = ({
  title,
  content,
  onChange,
  readOnly = false,
  placeholder = '',
  highlightRedactions = false,
  loading = false,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (onChange) {
      onChange(e.target.value);
    }
  };

  // Function to highlight redacted tokens
  const highlightRedactedText = (text: string) => {
    if (!highlightRedactions) return text;
    
    // Replace <PII_TYPE_#> patterns with highlighted spans
    // This matches patterns like <PII_PERSON_1>, <PII_EMAIL_1>, <PII_ADDRESS_1>, etc.
    return text.replace(/<PII_[A-Z_]+_\d+>/g, (match) => {
      return `<span class="redacted">${match}</span>`;
    });
  };

  return (
    <div className="flex flex-col h-full border border-gray-300 rounded-lg shadow-sm">
      <div className="bg-gray-100 px-4 py-2 border-b border-gray-300 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        {loading && (
          <div className="flex items-center text-sm text-gray-600">
            <svg className="animate-spin h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Processing...
          </div>
        )}
      </div>
      <div className="flex-1 p-4 overflow-auto relative">
        {loading && (
          <div className="absolute inset-0 bg-white bg-opacity-50 z-10"></div>
        )}
        {readOnly ? (
          highlightRedactions ? (
            <pre 
              className="whitespace-pre-wrap font-mono text-sm text-gray-900"
              dangerouslySetInnerHTML={{ __html: highlightRedactedText(content) }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900">{content}</pre>
          )
        ) : (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder={placeholder}
            className="w-full h-full resize-none outline-none font-mono text-sm text-gray-900 bg-white placeholder-gray-500"
          />
        )}
      </div>
    </div>
  );
};

export default TextBox;