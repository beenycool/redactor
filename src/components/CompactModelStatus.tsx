import React, { useEffect, useState } from 'react';

export const CompactModelStatus: React.FC = () => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline' | 'error'>('checking');
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const checkStatus = async () => {
    try {
      const response = await fetch('/api/model-status');
      const data = await response.json();
      setStatus(data.status === 'online' ? 'online' : 'offline');
      setLastChecked(new Date());
    } catch (error) {
      setStatus('error');
      setLastChecked(new Date());
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'online':
        return (
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        );
      case 'offline':
        return (
          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
        );
      case 'error':
        return (
          <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
        );
      default:
        return (
          <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
        );
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Error';
      default:
        return 'Checking...';
    }
  };

  return (
    <div className="space-y-1">
      <h4 className="text-xs font-medium text-gray-700">Model Status</h4>
      <div className="flex items-center gap-1.5">
        {getStatusIcon()}
        <span className="text-xs text-gray-600">{getStatusText()}</span>
      </div>
      <p className="text-xs text-gray-500">
        Last checked: {lastChecked.toLocaleTimeString()}
      </p>
    </div>
  );
};