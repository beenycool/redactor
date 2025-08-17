"""
FastAPI application for Court Report Redactor API
"""

import os
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from fastapi.exceptions import RequestValidationError
import logging
import sys
from functools import lru_cache
import hashlib
from typing import Optional, Tuple
import time
from fastapi import Request
from cachetools import TTLCache

from app.redaction import EnhancedPIIRedactor
from app import __version__

# Track process start time for uptime
PROCESS_START_TIME = time.time()

from cachetools import TTLCache
import threading

# Thread-safe TTL cache for redaction results
# Cache size: 100 entries, TTL: 1 hour (3600 seconds)
REDACTION_CACHE = TTLCache(maxsize=100, ttl=3600)
REDACTION_CACHE_LOCK = threading.RLock()
def error_json(status_code: int, error: str, message: str, details: Any = None) -> Dict[str, Any]:
    """
    Helper function to create consistent error response envelopes.
    
    Args:
        status_code: HTTP status code
        error: Short error type/name
        message: Human-readable error message
        details: Optional additional error details
        
    Returns:
        Dict containing standardized error response
    """
    response = {
        "status_code": status_code,
        "error": error,
        "message": message
    }
    if details is not None:
        response["details"] = details
    return response

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

# --- Rate Limiting Middleware ---
class RateLimitMiddleware:
    def __init__(self, app, max_requests: int = 60, window_seconds: int = 60):
        self.app = app
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests: Dict[str, List[float]] = {}

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Get client IP
        client_host = scope.get("client")
        ip = client_host[0] if client_host else "unknown"

        now = time.time()
        window_start = now - self.window_seconds

        # Clean up old timestamps and count requests
        timestamps = self.requests.get(ip, [])
        timestamps = [ts for ts in timestamps if ts > window_start]
        if len(timestamps) >= self.max_requests:
            # Rate limit exceeded
            response = JSONResponse(
                status_code=429,
                content=error_json(
                    status_code=429,
                    error="Too Many Requests",
                    message=f"Rate limit exceeded: {self.max_requests} requests per {self.window_seconds} seconds. Please try again later."
                )
            )
            await response(scope, receive, send)
            return

        # Record this request
        timestamps.append(now)
        self.requests[ip] = timestamps

        await self.app(scope, receive, send)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Initialize the redactor
logger.info("Initializing PII Redactor...")
try:
    redactor = EnhancedPIIRedactor()
    logger.info("PII Redactor initialized successfully")
except Exception as e:
    logger.error(f"Failed to initialize PII Redactor: {e}")
    redactor = None


def get_cached_redaction(text: str, confidence_threshold: float = 0.5) -> Tuple[str, List[Dict[str, Any]]]:
    """
    Get cached redaction result or compute new one if not cached.
    
    This function handles the actual caching logic by computing the hash and
    either returning cached results or computing new ones.
    
    Args:
        text: Original text to redact
        confidence_threshold: Confidence threshold for PII detection
        
    Returns:
        Tuple of (redacted_text, token_mappings)
    """
    # Compute hash of input text for caching
    text_hash = hashlib.md5(text.encode()).hexdigest()

    # Normalize threshold for key stability
    threshold_key = f"{confidence_threshold:.6f}"
    cache_key = (text_hash, threshold_key)

    # Thread-safe cache lookup
    with REDACTION_CACHE_LOCK:
        cached = REDACTION_CACHE.get(cache_key)
        if cached is not None:
            return cached

    # Compute new result outside the lock
    redacted_text, token_mappings = redactor.redact_text(text, confidence_threshold)

    # Thread-safe cache write
    with REDACTION_CACHE_LOCK:
        REDACTION_CACHE[cache_key] = (redacted_text, token_mappings)

    return redacted_text, token_mappings


# Request/Response models
class RedactRequest(BaseModel):
    """Request model for redaction endpoint"""
    text: str = Field(..., max_length=50000, description="Original text to redact")
    confidence_threshold: float = Field(0.5, ge=0.0, le=1.0, description="Minimum confidence threshold for PII detection (0.0-1.0)")
    
    class Config:
        json_schema_extra = {
            "example": {
                "text": "John Doe appeared before Judge Smith on Case No. 2024-CR-1234. His SSN is 123-45-6789.",
                "confidence_threshold": 0.5
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

class DependencyStatus(BaseModel):
    name: str
    available: bool
    version: str = ""

class DetailedHealthResponse(BaseModel):
    status: str = Field(..., description="Service status")
    uptime: float = Field(..., description="Uptime in seconds")
    version: str = Field(..., description="Service version")
    dependencies: List[DependencyStatus] = Field(..., description="Dependency status list")
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

@app.get("/healthz", response_model=DetailedHealthResponse, tags=["Health"])
async def healthz():
    """Detailed health check endpoint"""
    # Calculate uptime
    uptime = time.time() - PROCESS_START_TIME

    # Dependency checks
    dependencies = []
    # FastAPI
    try:
        import fastapi
        dependencies.append(DependencyStatus(
            name="fastapi",
            available=True,
            version=getattr(fastapi, "__version__", "")
        ))
    except Exception:
        dependencies.append(DependencyStatus(
            name="fastapi",
            available=False,
            version=""
        ))
    # Pydantic
    try:
        import pydantic
        dependencies.append(DependencyStatus(
            name="pydantic",
            available=True,
            version=getattr(pydantic, "__version__", "")
        ))
    except Exception:
        dependencies.append(DependencyStatus(
            name="pydantic",
            available=False,
            version=""
        ))
    # app.redaction
    try:
        from app import redaction
        dependencies.append(DependencyStatus(
            name="app.redaction",
            available=True,
            version=getattr(redaction, "__version__", "")
        ))
    except Exception:
        dependencies.append(DependencyStatus(
            name="app.redaction",
            available=False,
            version=""
        ))

    # Model status
    model_ok = redactor is not None
    status = "healthy" if model_ok else "unhealthy"
    message = "Service is running properly" if model_ok else "Model failed to load"

    return DetailedHealthResponse(
        status=status,
        uptime=uptime,
        version=__version__,
        dependencies=dependencies,
        model_loaded=model_ok,
        message=message
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

        # Get cached or compute new redaction result
        redacted_text, token_mappings = get_cached_redaction(request.text, request.confidence_threshold)

        logger.info(f"Redaction completed. Found {len(token_mappings)} PII entities")

        # Convert to response format
        tokens = [TokenMapping(**mapping) for mapping in token_mappings]

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
        
    except ValueError as e:
        # Handle validation errors (e.g., tokens not found in redacted text)
        logger.warning(f"Validation error during restoration: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid restoration request: {str(e)}"
        ) from e
    except Exception as e:
        logger.error(f"Error during restoration: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error restoring text: {str(e)}"
        )


# Error handlers

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request, exc):
    """Handle validation errors with clear JSON payload"""
    # Try to craft a clearer message for common cases (e.g., text too long)
    message = "Invalid request payload"
    try:
        # FastAPI provides errors() list with loc and msg; use first for brevity
        errors = exc.errors() if hasattr(exc, "errors") else []
        if errors:
            first = errors[0]
            msg = first.get("msg", "")
            loc = first.get("loc", [])
            # Custom hint if text field exceeds length constraints (if any)
            if "too long" in msg.lower() or "ensure this value has at most" in msg.lower():
                # Align with requested example wording
                message = "Text is too long. Maximum 50,000 characters allowed."
            else:
                # Generic human-readable combination
                field = ".".join(str(x) for x in loc if isinstance(x, (str, int)))
                message = f"Validation error at '{field}': {msg}" if field else f"Validation error: {msg}"
        details = errors or str(exc)
    except Exception:
        details = str(exc)

    return JSONResponse(
        status_code=422,
        content=error_json(
            status_code=422,
            error="Invalid input",
            message=message,
            details=details
        )
    )

@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Handle 404 errors"""
    return JSONResponse(
        status_code=404,
        content=error_json(
            status_code=404,
            error="Not Found",
            message=f"The requested endpoint '{request.url.path}' was not found"
        )
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Handle 500 errors"""
    logger.error(f"Internal server error: {exc}")
    return JSONResponse(
        status_code=500,
        content=error_json(
            status_code=500,
            error="Internal Server Error",
            message="An unexpected error occurred"
        )
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
            test_token_counter = {}
            redactor.detect_pii(test_text, test_token_counter)
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