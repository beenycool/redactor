import React from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/cjs/styles/prism';

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
            <div className="prose max-w-none">
              <ReactMarkdown
                components={{
                  code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
                    const match = /language-(\w+)/.exec(className || '');
                    return match ? (
                      <SyntaxHighlighter
                        style={tomorrow as any}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className="bg-gray-100 px-1 py-0.5 rounded text-sm" {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {content}
              </ReactMarkdown>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-sm text-gray-900 dark:text-gray-100">{content}</pre>
          )
        ) : (
          <textarea
            value={content}
            onChange={handleChange}
            placeholder={placeholder}
            className="w-full h-full resize-none outline-none font-mono text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 placeholder-gray-500 dark:placeholder-gray-400"
          />
        )}
      </div>
    </div>
  );
};

export default TextBox;