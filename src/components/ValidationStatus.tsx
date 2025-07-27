import React, { useState, useEffect } from 'react';
import { SmolLM3Client } from '@/lib/smolLM3';
import { Check, X, AlertCircle, RefreshCw } from 'lucide-react';

interface ValidationStatusProps {
  smolLM3Url: string;
}

export const ValidationStatus: React.FC<ValidationStatusProps> = ({ smolLM3Url }) => {
  const [status, setStatus] = useState<'checking' | 'available' | 'basic' | 'unavailable'>('checking');
  const [capabilities, setCapabilities] = useState({
    generation: false,
    validation: false,
    entityExtraction: false
  });

  useEffect(() => {
    checkApiCapabilities();
  }, [smolLM3Url]);

  const checkApiCapabilities = async () => {
    setStatus('checking');
    
    if (!smolLM3Url) {
      setStatus('unavailable');
      return;
    }

    try {
      const client = new SmolLM3Client({ baseUrl: smolLM3Url, timeout: 5000 });
      
      const isHealthy = await client.healthCheck();
      if (!isHealthy) {
        setStatus('unavailable');
        return;
      }

      const newCapabilities = {
        generation: false,
        validation: false,
        entityExtraction: false
      };

      try {
        await client.generate('test');
        newCapabilities.generation = true;
      } catch {}

      try {
        await client.validateRedaction('test text', 'test <PII> text');
        newCapabilities.validation = true;
      } catch {}

      try {
        await client.extractEntities('test text');
        newCapabilities.entityExtraction = true;
      } catch {}

      setCapabilities(newCapabilities);
      setStatus(newCapabilities.validation && newCapabilities.entityExtraction ? 'available' : 
               newCapabilities.generation ? 'basic' : 'unavailable');

    } catch {
      setStatus('unavailable');
    }
  };

  const getStatusConfig = () => {
    switch (status) {
      case 'checking':
        return {
          icon: <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />,
          title: 'Checking...',
          color: 'text-blue-600',
          bg: 'bg-blue-50'
        };
      case 'available':
        return {
          icon: <Check className="w-3 h-3 text-green-500" />,
          title: 'Enhanced',
          color: 'text-green-600',
          bg: 'bg-green-50'
        };
      case 'basic':
        return {
          icon: <AlertCircle className="w-3 h-3 text-yellow-500" />,
          title: 'Basic',
          color: 'text-yellow-600',
          bg: 'bg-yellow-50'
        };
      case 'unavailable':
        return {
          icon: <X className="w-3 h-3 text-red-500" />,
          title: 'Offline',
          color: 'text-red-600',
          bg: 'bg-red-50'
        };
    }
  };

  const config = getStatusConfig();

  return (
    <div className={`p-2 rounded ${config.bg} border`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {config.icon}
          <span className={`text-xs font-medium ${config.color}`}>{config.title}</span>
        </div>
        <button
          onClick={checkApiCapabilities}
          disabled={status === 'checking'}
          className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-50"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${status === 'checking' ? 'animate-spin' : ''}`} />
        </button>
      </div>
    </div>
  );
};
