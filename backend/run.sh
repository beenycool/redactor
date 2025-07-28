#!/usr/bin/env bash
set -euo pipefail

# Court Report Redactor Backend - Startup Script

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting Court Report Redactor Backend API...${NC}"

# Check if we're in the backend directory
if [ ! -f "requirements.txt" ]; then
    echo -e "${RED}Error: This script must be run from the backend directory${NC}"
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo -e "${YELLOW}Virtual environment not found. Creating...${NC}"
    python3 -m venv venv
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to create virtual environment${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Virtual environment created successfully${NC}"
fi

# Activate virtual environment
echo -e "${YELLOW}Activating virtual environment...${NC}"
source venv/bin/activate

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to activate virtual environment${NC}"
    exit 1
fi

# Check if dependencies are installed
if ! python -c "import fastapi" 2>/dev/null; then
    echo -e "${YELLOW}Dependencies not installed. Installing...${NC}"
    pip install -r requirements.txt
    
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to install dependencies${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Dependencies installed successfully${NC}"
fi

# Optional: Download model on first run
echo -e "${YELLOW}Checking if model needs to be downloaded...${NC}"
python -c "
from transformers import AutoTokenizer, AutoModelForTokenClassification
import sys

try:
    print('Downloading/verifying model...')
    tokenizer = AutoTokenizer.from_pretrained('iiiorg/piiranha-v1-detect-personal-information')
    model = AutoModelForTokenClassification.from_pretrained('iiiorg/piiranha-v1-detect-personal-information')
    print('Model ready!')
except Exception as e:
    print(f'Warning: Could not pre-download model: {e}')
    print('Model will be downloaded on first use')
"

# Start the server
echo -e "${GREEN}Starting Uvicorn server on http://0.0.0.0:8000${NC}"
echo -e "${GREEN}API documentation available at http://localhost:8000/docs${NC}"
echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"

# Run uvicorn with auto-reload for development
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload