import React, { useState } from 'react';
import { redactionService } from '../services/redactionService';
import { tokensToJson } from '../utils/tokenUtils';

export default function TestTokens() {
  const [text, setText] = useState('Bob Smith appeared before Judge Johnson on Case No. 2024-CR-1234.');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRedact = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await redactionService.redactText(text);
      const jsonOutput = tokensToJson(response.tokens);
      setResult({
        redactedText: response.redactedText,
        tokens: response.tokens,
        jsonOutput: jsonOutput
      });
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Test Token Values</h1>
      
      <div style={{ marginBottom: '20px' }}>
        <label>
          <strong>Input Text:</strong>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '10px',
              marginTop: '5px',
              fontFamily: 'monospace'
            }}
          />
        </label>
      </div>

      <button
        onClick={handleRedact}
        disabled={loading || !text}
        style={{
          padding: '10px 20px',
          fontSize: '16px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.6 : 1
        }}
      >
        {loading ? 'Processing...' : 'Redact Text'}
      </button>

      {error && (
        <div style={{ color: 'red', marginTop: '10px' }}>
          Error: {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '30px' }}>
          <h2>Results</h2>
          
          <div style={{ marginBottom: '20px' }}>
            <h3>Redacted Text:</h3>
            <div style={{
              padding: '10px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              fontFamily: 'monospace'
            }}>
              {result.redactedText}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h3>Raw Tokens (from API):</h3>
            <pre style={{
              padding: '10px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              {JSON.stringify(result.tokens, null, 2)}
            </pre>
          </div>

          <div>
            <h3>Formatted JSON Output:</h3>
            <pre style={{
              padding: '10px',
              backgroundColor: '#f5f5f5',
              borderRadius: '4px',
              overflow: 'auto'
            }}>
              {result.jsonOutput}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}