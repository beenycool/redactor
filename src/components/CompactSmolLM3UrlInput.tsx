import React, { useState, useEffect } from 'react';

interface CompactSmolLM3UrlInputProps {
  url: string;
  onUrlChange: (url: string) => void;
}

export const CompactSmolLM3UrlInput: React.FC<CompactSmolLM3UrlInputProps> = ({ url, onUrlChange }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [tempUrl, setTempUrl] = useState(url);

  useEffect(() => {
    setTempUrl(url);
  }, [url]);

  const handleSave = () => {
    if (tempUrl.trim()) {
      onUrlChange(tempUrl.trim());
      setIsEditing(false);
    }
  };

  const handleCancel = () => {
    setTempUrl(url);
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600">Model URL</label>
      
      {isEditing ? (
        <div className="space-y-1">
          <input
            type="url"
            value={tempUrl}
            onChange={(e) => setTempUrl(e.target.value)}
            onKeyDown={handleKeyPress}
            placeholder="https://your-ngrok-url.ngrok-free.app"
            className="w-full px-2 py-1 text-xs border rounded focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          <div className="flex gap-1">
            <button
              onClick={handleSave}
              className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="px-2 py-0.5 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="text-xs text-gray-600 truncate">{url || 'Not set'}</span>
          <button
            onClick={() => setIsEditing(true)}
            className="px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-50 rounded"
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
};