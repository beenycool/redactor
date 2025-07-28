"""
FastAPI application for Court Report Redactor API
"""

import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import logging
import sys

from app.redaction import EnhancedPIIRedactor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title="Court Report Redactor API",
    description="API for redacting PII from court reports using advanced NLP models",
    version="1.0.0"
)

# Configure CORS
def get_allowed_origins() -> List[str]:
    """Get allowed origins from environment variable or use defaults."""
    origins_str = os.getenv("ALLOWED_ORIGINS", "")
    if origins_str:
        # Split by comma and strip whitespace
        origins = [origin.strip() for origin in origins_str.split(",")]
        # Filter out empty strings
        return [origin for origin in origins if origin]
    else:
        # Default allowed origins for development
        return [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]

allowed_origins = get_allowed_origins()
logger.info(f"Configured CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

# Initialize the redactor
logger.info("Initializing PII Redactor...")
try:
    redactor = EnhancedPIIRedactor()
    logger.info("PII Redactor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize PII Redactor: {e}")
    redactor = None


# Request/Response models
class RedactRequest(BaseModel):
    """Request model for redaction endpoint"""
    text: str = Field(..., description="Original text to redact")
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "John Doe appeared before Judge Smith on Case No. 2024-CR-1234. His SSN is 123-45-6789."
            }
        }


class TokenMapping(BaseModel):
    """Token mapping information"""
    token: str = Field(..., description="Redaction token")
    value: str = Field(..., description="Original value")
    type: str = Field(..., description="Entity type")
    start: int = Field(..., description="Start position in original text")
    end: int = Field(..., description="End position in original text")


class RedactResponse(BaseModel):
    """Response model for redaction endpoint"""
    redacted_text: str = Field(..., description="Text with PII redacted")
    tokens: List[TokenMapping] = Field(..., description="Token mappings for restoration")
    
    class Config:
        json_schema_extra = {
            "example": {
                "redacted_text": "<PII_PERSON_1> appeared before <PII_PERSON_2> on <PII_CASE_NUMBER_1>. His SSN is <PII_SSN_1>.",
                "tokens": [
                    {
                        "token": "<PII_PERSON_1>",
                        "value": "John Doe",
                        "type": "PERSON",
                        "start": 0,
                        "end": 8
                    }
                ]
            }
        }


class RestoreRequest(BaseModel):
    """Request model for restore endpoint"""
    redacted_text: str = Field(..., description="Redacted text with tokens")
    tokens: List[TokenMapping] = Field(..., description="Token mappings for restoration")
    
    class Config:
        json_schema_extra = {
            "example": {
                "redacted_text": "<PII_PERSON_1> appeared before <PII_PERSON_2>",
                "tokens": [
                    {
                        "token": "<PII_PERSON_1>",
                        "value": "John Doe",
                        "type": "PERSON",
                        "start": 0,
                        "end": 8
                    },
                    {
                        "token": "<PII_PERSON_2>",
                        "value": "Judge Smith",
                        "type": "PERSON",
                        "start": 24,
                        "end": 35
                    }
                ]
            }
        }


class RestoreResponse(BaseModel):
    """Response model for restore endpoint"""
    restored_text: str = Field(..., description="Text with original values restored")
    
    class Config:
        json_schema_extra = {
            "example": {
                "restored_text": "John Doe appeared before Judge Smith"
            }
        }


class HealthResponse(BaseModel):
    """Health check response"""
    status: str = Field(..., description="Service status")
    model_loaded: bool = Field(..., description="Whether the model is loaded")
    message: str = Field(..., description="Status message")


# API Endpoints
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint"""
    return {
        "name": "Court Report Redactor API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "redact": "/redact",
            "restore": "/restore",
            "docs": "/docs"
        }
    }


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Check the health status of the API"""
    if redactor is None:
        return HealthResponse(
            status="unhealthy",
            model_loaded=False,
            message="Model failed to load"
        )
    
    return HealthResponse(
        status="healthy",
        model_loaded=True,
        message="Service is running properly"
    )


@app.post("/redact", response_model=RedactResponse, tags=["Redaction"])
async def redact_text(request: RedactRequest):
    """
    Redact PII from the provided text
    
    This endpoint accepts plain text and returns:
    - Redacted text with PII replaced by tokens
    - Token mappings containing original values and positions
    """
    if redactor is None:
        raise HTTPException(
            status_code=503,
            detail="Redaction service is not available. Model failed to load."
        )
    
    try:
        logger.debug(f"Processing redaction request for text of length {len(request.text)}")
        
        # Perform redaction
        redacted_text, token_mappings = redactor.redact_text(request.text)
        
        logger.info(f"Redaction completed. Found {len(token_mappings)} PII entities")
        
        # Convert to response format
        tokens = [
            TokenMapping(**mapping)
            for mapping in token_mappings
        ]
        
        return RedactResponse(
            redacted_text=redacted_text,
            tokens=tokens
        )
        
    except Exception as e:
        logger.error(f"Error during redaction: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing text: {str(e)}"
        )


@app.post("/restore", response_model=RestoreResponse, tags=["Restoration"])
async def restore_text(request: RestoreRequest):
    """
    Restore original text from redacted text using token mappings
    
    This endpoint accepts:
    - Redacted text containing PII tokens
    - Token mappings with original values
    
    Returns the restored text with original values
    """
    if redactor is None:
        raise HTTPException(
            status_code=503,
            detail="Redaction service is not available. Model failed to load."
        )
    
    try:
        logger.info(f"Processing restore request with {len(request.tokens)} tokens")
        
        # Convert token mappings to dict format
        token_mappings = [
            {
                "token": token.token,
                "value": token.value,
                "type": token.type,
                "start": token.start,
                "end": token.end
            }
            for token in request.tokens
        ]
        
        # Perform restoration
        restored_text = redactor.restore_text(
            request.redacted_text,
            token_mappings
        )
        
        logger.info("Text restoration completed")
        
        return RestoreResponse(restored_text=restored_text)
        
    except Exception as e:
        logger.error(f"Error during restoration: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error restoring text: {str(e)}"
        )


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Handle 404 errors"""
    return JSONResponse(
        status_code=404,
        content={
            "error": "Not Found",
            "message": f"The requested endpoint '{request.url.path}' was not found",
            "status_code": 404
        }
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal Server Error",
            "message": "An unexpected error occurred",
            "status_code": 500
        }
    )


# Startup and shutdown events
@app.on_event("startup")
async def startup_event():
    """Run on application startup"""
    logger.info("Court Report Redactor API starting up...")
    logger.info(f"Model loaded: {redactor is not None}")
    
    if redactor is not None:
        # Warm up the model with a test sentence
        try:
            test_text = "This is a test."
            redactor.detect_pii(test_text)
            logger.info("Model warmup completed")
        except Exception as e:
            logger.error(f"Model warmup failed: {e}")


@app.on_event("shutdown")
async def shutdown_event():
    """Run on application shutdown"""
    logger.info("Court Report Redactor API shutting down...")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )