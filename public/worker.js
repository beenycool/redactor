// Web Worker for PII processing
// Import transformers.js from CDN since ES modules aren't supported in workers in all browsers
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js');

let classifier = null;

const PRIMARY_PII_MODEL = 'iiiorg/piiranha-v1-detect-personal-information';
const FALLBACK_MODEL = 'Xenova/bert-base-NER';

async function initializeModel() {
  if (classifier) return classifier;

  try {
    console.log('Worker: Loading PII model...');
    classifier = await pipeline('token-classification', PRIMARY_PII_MODEL, {
      dtype: 'q4',
      local_files_only: false,
      progress_callback: (data) => {
        if (data.status === 'downloading') {
          self.postMessage({
            type: 'progress',
            progress: data.progress || 0,
            file: data.file || 'model'
          });
        }
      }
    });
    console.log('Worker: PII model loaded successfully');
    return classifier;
  } catch (error) {
    console.warn('Worker: Failed to load primary model, trying fallback...', error);
    
    try {
      classifier = await pipeline('token-classification', FALLBACK_MODEL, {
        dtype: 'q4',
        local_files_only: false,
        progress_callback: (data) => {
          if (data.status === 'downloading') {
            self.postMessage({
              type: 'progress',
              progress: data.progress || 0,
              file: data.file || 'model'
            });
          }
        }
      });
      console.log('Worker: Fallback model loaded successfully');
      return classifier;
    } catch (fallbackError) {
      console.error('Worker: Failed to load any model', fallbackError);
      throw new Error(`Failed to load any model: ${fallbackError.message}`);
    }
  }
}

self.onmessage = async (e) => {
  try {
    const { type, text, chunkIndex } = e.data;

    switch (type) {
      case 'initialize':
        try {
          await initializeModel();
          self.postMessage({ type: 'initialized' });
        } catch (error) {
          self.postMessage({ 
            type: 'error', 
            error: `Initialization failed: ${error.message}` 
          });
        }
        break;

      case 'process':
        try {
          if (!classifier) {
            await initializeModel();
          }
          
          const results = await classifier(text);
          
          // Ensure results is an array
          const entitiesArray = Array.isArray(results) ? results : [];
          
          self.postMessage({
            type: 'results',
            chunkIndex,
            entities: entitiesArray.map(r => ({
              entity_group: String(r.entity_group || r.entity || 'MISC'),
              word: String(r.word || ''),
              start: Number(r.start || 0),
              end: Number(r.end || 0),
              score: Number(r.score || 0)
            }))
          });
        } catch (error) {
          self.postMessage({
            type: 'error',
            error: `Processing failed: ${error.message}`,
            chunkIndex
          });
        }
        break;

      default:
        console.warn('Worker: Unknown message type:', type);
        self.postMessage({
          type: 'error',
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      error: `Worker error: ${error.message}`
    });
  }
};
