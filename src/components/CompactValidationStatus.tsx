import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, AlertCircle, Loader2 } from 'lucide-react';

interface CompactValidationStatusProps {
  url: string;
}

export const CompactValidationStatus: React.FC<CompactValidationStatusProps> = ({ url }) => {
  const [status, setStatus] = useState<'checking' | 'valid' | 'invalid' | 'error'>('checking');
  const [message, setMessage] = useState('Checking...');

  useEffect(() => {
    if (!url) {
      setStatus('invalid');
      setMessage('URL required');
      return;
    }

    const validateUrl = async () => {
      try {
        const response = await fetch('/api/validate-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        
        const data = await response.json();
        
        if (data.valid) {
          setStatus('valid');
          setMessage('Connected');
        } else {
          setStatus('invalid');
          setMessage(data.error || 'Invalid URL');
        }
      } catch (error) {
        setStatus('error');
        setMessage('Connection failed');
      }
    };

    // Debounce validation
    const timeoutId = setTimeout(validateUrl, 500);
    return () => clearTimeout(timeoutId);
  }, [url]);

  const getStatusIcon = () => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'invalid':
        return <XCircle className="w-3 h-3 text-red-500" />;
      case 'error':
        return <AlertCircle className="w-3 h-3 text-yellow-500" />;
      default:
        return <Loader2 className="w-3 h-3 text-gray-500 animate-spin" />;
    }
  };

  return (
    <div className="flex items-center gap-1">
      {getStatusIcon()}
      <span className="text-xs text-gray-600">{message}</span>
    </div>
  );
};