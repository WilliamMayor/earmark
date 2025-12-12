# Task 06: Add CORS Middleware and Error Handling

## Context
This task enhances the FastAPI application with comprehensive CORS (Cross-Origin Resource Sharing) middleware configuration and robust error handling. CORS is essential for allowing the frontend to communicate with the backend API, while proper error handling ensures a professional user experience and easier debugging.

## Objectives
- Configure CORS middleware with proper security settings
- Implement custom exception classes
- Create global error handlers for common scenarios
- Add request/response validation error handling
- Implement error logging and tracking
- Create error response models

## Prerequisites
- Task 05 completed (health endpoints implemented)
- FastAPI application running
- Basic understanding of CORS
- Virtual environment activated

## Task Instructions

### Step 1: Create Custom Exception Classes
Create `api/app/exceptions.py`:

```python
"""Custom exceptions for Budget Tool API."""

from typing import Any, Dict, Optional


class BudgetToolException(Exception):
    """Base exception for Budget Tool API."""
    
    def __init__(
        self,
        message: str,
        status_code: int = 500,
        details: Optional[Dict[str, Any]] = None,
    ):
        """
        Initialize exception.
        
        Args:
            message: Error message
            status_code: HTTP status code
            details: Additional error details
        """
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(BudgetToolException):
    """Resource not found exception."""
    
    def __init__(self, resource: str, identifier: Any):
        """Initialize not found error."""
        super().__init__(
            message=f"{resource} not found: {identifier}",
            status_code=404,
            details={"resource": resource, "identifier": str(identifier)},
        )


class ValidationError(BudgetToolException):
    """Validation error exception."""
    
    def __init__(self, message: str, field: Optional[str] = None):
        """Initialize validation error."""
        details = {}
        if field:
            details["field"] = field
        super().__init__(
            message=message,
            status_code=422,
            details=details,
        )


class ConflictError(BudgetToolException):
    """Resource conflict exception."""
    
    def __init__(self, message: str, resource: Optional[str] = None):
        """Initialize conflict error."""
        details = {}
        if resource:
            details["resource"] = resource
        super().__init__(
            message=message,
            status_code=409,
            details=details,
        )


class UnauthorizedError(BudgetToolException):
    """Unauthorized access exception."""
    
    def __init__(self, message: str = "Unauthorized"):
        """Initialize unauthorized error."""
        super().__init__(
            message=message,
            status_code=401,
        )


class ForbiddenError(BudgetToolException):
    """Forbidden access exception."""
    
    def __init__(self, message: str = "Forbidden"):
        """Initialize forbidden error."""
        super().__init__(
            message=message,
            status_code=403,
        )


class BadRequestError(BudgetToolException):
    """Bad request exception."""
    
    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None):
        """Initialize bad request error."""
        super().__init__(
            message=message,
            status_code=400,
            details=details,
        )


class InternalServerError(BudgetToolException):
    """Internal server error exception."""
    
    def __init__(
        self,
        message: str = "Internal server error",
        details: Optional[Dict[str, Any]] = None,
    ):
        """Initialize internal server error."""
        super().__init__(
            message=message,
            status_code=500,
            details=details,
        )


class ServiceUnavailableError(BudgetToolException):
    """Service unavailable exception."""
    
    def __init__(
        self,
        message: str = "Service temporarily unavailable",
        retry_after: Optional[int] = None,
    ):
        """Initialize service unavailable error."""
        details = {}
        if retry_after:
            details["retry_after"] = retry_after
        super().__init__(
            message=message,
            status_code=503,
            details=details,
        )
```

### Step 2: Create Error Response Models
Create `api/app/models/errors.py`:

```python
"""Error response models for Budget Tool API."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """Error detail model."""
    
    loc: Optional[List[str]] = Field(None, description="Error location")
    msg: str = Field(..., description="Error message")
    type: str = Field(..., description="Error type")


class ErrorResponse(BaseModel):
    """Standard error response."""
    
    error: str = Field(..., description="Error message")
    status_code: int = Field(..., description="HTTP status code")
    details: Optional[Dict[str, Any]] = Field(
        None,
        description="Additional error details"
    )
    request_id: Optional[str] = Field(
        None,
        description="Request ID for tracking"
    )


class ValidationErrorResponse(BaseModel):
    """Validation error response."""
    
    error: str = Field("Validation failed", description="Error message")
    status_code: int = Field(422, description="HTTP status code")
    errors: List[ErrorDetail] = Field(..., description="Validation errors")
    request_id: Optional[str] = Field(
        None,
        description="Request ID for tracking"
    )
```

### Step 3: Create CORS Configuration Module
Create `api/app/middleware/cors.py`:

```python
"""CORS middleware configuration for Budget Tool API."""

import logging
from typing import List

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

logger = logging.getLogger(__name__)


def setup_cors(app: FastAPI) -> None:
    """
    Configure CORS middleware for the application.
    
    Args:
        app: FastAPI application instance
    """
    settings = get_settings()
    
    # Log CORS configuration
    logger.info(f"Setting up CORS with origins: {settings.cors_origins}")
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
        expose_headers=["X-Request-ID", "X-Total-Count"],
        max_age=3600,  # Cache preflight requests for 1 hour
    )


def get_allowed_origins() -> List[str]:
    """
    Get list of allowed origins based on environment.
    
    Returns:
        List of allowed origin URLs
    """
    settings = get_settings()
    
    # Base origins from settings
    origins = settings.cors_origins.copy()
    
    # Add additional origins based on environment
    if settings.is_development:
        # Common development ports
        dev_origins = [
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5173",
            "http://localhost:5174",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5173",
        ]
        for origin in dev_origins:
            if origin not in origins:
                origins.append(origin)
    
    return origins
```

### Step 4: Create Error Handler Module
Create `api/app/middleware/error_handlers.py`:

```python
"""Error handlers for Budget Tool API."""

import logging
import traceback
import uuid
from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError as PydanticValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.exceptions import BudgetToolException
from app.models.errors import ErrorResponse, ValidationErrorResponse

logger = logging.getLogger(__name__)


def setup_exception_handlers(app: FastAPI) -> None:
    """
    Configure exception handlers for the application.
    
    Args:
        app: FastAPI application instance
    """
    
    @app.exception_handler(BudgetToolException)
    async def budget_tool_exception_handler(
        request: Request, exc: BudgetToolException
    ) -> JSONResponse:
        """Handle Budget Tool custom exceptions."""
        request_id = str(uuid.uuid4())
        
        # Log the error
        logger.error(
            f"BudgetToolException: {exc.message}",
            extra={
                "request_id": request_id,
                "status_code": exc.status_code,
                "details": exc.details,
                "path": request.url.path,
                "method": request.method,
            },
        )
        
        # Create error response
        error_response = ErrorResponse(
            error=exc.message,
            status_code=exc.status_code,
            details=exc.details,
            request_id=request_id,
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response.model_dump(exclude_none=True),
            headers={"X-Request-ID": request_id},
        )
    
    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Handle request validation errors."""
        request_id = str(uuid.uuid4())
        
        # Log the validation error
        logger.warning(
            "Request validation failed",
            extra={
                "request_id": request_id,
                "errors": exc.errors(),
                "path": request.url.path,
                "method": request.method,
            },
        )
        
        # Format validation errors
        errors = []
        for error in exc.errors():
            errors.append({
                "loc": error.get("loc"),
                "msg": error.get("msg"),
                "type": error.get("type"),
            })
        
        # Create validation error response
        error_response = ValidationErrorResponse(
            errors=errors,
            request_id=request_id,
        )
        
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(exclude_none=True),
            headers={"X-Request-ID": request_id},
        )
    
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(
        request: Request, exc: StarletteHTTPException
    ) -> JSONResponse:
        """Handle Starlette HTTP exceptions."""
        request_id = str(uuid.uuid4())
        
        # Log the HTTP exception
        logger.warning(
            f"HTTP exception: {exc.detail}",
            extra={
                "request_id": request_id,
                "status_code": exc.status_code,
                "path": request.url.path,
                "method": request.method,
            },
        )
        
        # Create error response
        error_response = ErrorResponse(
            error=str(exc.detail),
            status_code=exc.status_code,
            request_id=request_id,
        )
        
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response.model_dump(exclude_none=True),
            headers={"X-Request-ID": request_id},
        )
    
    @app.exception_handler(PydanticValidationError)
    async def pydantic_validation_exception_handler(
        request: Request, exc: PydanticValidationError
    ) -> JSONResponse:
        """Handle Pydantic validation errors."""
        request_id = str(uuid.uuid4())
        
        # Log the validation error
        logger.warning(
            "Pydantic validation failed",
            extra={
                "request_id": request_id,
                "errors": exc.errors(),
                "path": request.url.path,
                "method": request.method,
            },
        )
        
        # Create error response
        error_response = ErrorResponse(
            error="Invalid request data",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            details={"errors": exc.errors()},
            request_id=request_id,
        )
        
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=error_response.model_dump(exclude_none=True),
            headers={"X-Request-ID": request_id},
        )
    
    @app.exception_handler(Exception)
    async def general_exception_handler(
        request: Request, exc: Exception
    ) -> JSONResponse:
        """Handle unexpected exceptions."""
        request_id = str(uuid.uuid4())
        
        # Log the full exception with traceback
        logger.error(
            f"Unhandled exception: {str(exc)}",
            extra={
                "request_id": request_id,
                "path": request.url.path,
                "method": request.method,
                "traceback": traceback.format_exc(),
            },
        )
        
        # Create generic error response (don't expose internal details)
        error_response = ErrorResponse(
            error="An unexpected error occurred",
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            request_id=request_id,
        )
        
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=error_response.model_dump(exclude_none=True),
            headers={"X-Request-ID": request_id},
        )
```

### Step 5: Create Request ID Middleware
Create `api/app/middleware/request_id.py`:

```python
"""Request ID middleware for tracking requests."""

import uuid
from typing import Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Middleware to add request ID to all requests."""
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """Add request ID to request and response."""
        # Generate or get request ID
        request_id = request.headers.get("X-Request-ID")
        if not request_id:
            request_id = str(uuid.uuid4())
        
        # Store request ID in request state
        request.state.request_id = request_id
        
        # Process request
        response = await call_next(request)
        
        # Add request ID to response headers
        response.headers["X-Request-ID"] = request_id
        
        return response


def setup_request_id_middleware(app: FastAPI) -> None:
    """
    Configure request ID middleware.
    
    Args:
        app: FastAPI application instance
    """
    app.add_middleware(RequestIDMiddleware)
```

### Step 6: Update Main Application
Update `api/app/main.py` to include new middleware and error handlers:

Add these imports at the top:
```python
from app.middleware.cors import setup_cors
from app.middleware.error_handlers import setup_exception_handlers
from app.middleware.request_id import setup_request_id_middleware
```

Update the create_application function:
```python
def create_application() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()
    
    app = FastAPI(
        title=__app_name__,
        description=__description__,
        version=__version__,
        openapi_url=f"{settings.api_prefix}/openapi.json",
        docs_url="/docs" if settings.is_development else None,
        redoc_url="/redoc" if settings.is_development else None,
        lifespan=lifespan,
    )
    
    # Setup middleware
    setup_request_id_middleware(app)
    setup_cors(app)
    
    # Setup exception handlers
    setup_exception_handlers(app)
    
    # Add routes
    setup_routes(app)
    
    return app
```

Remove the old inline CORS middleware and exception handlers from main.py.

### Step 7: Create Error Handler Tests
Create `api/tests/test_error_handling.py`:

```python
"""Tests for error handling."""

import pytest
from fastapi.testclient import TestClient

from app.exceptions import (
    BadRequestError,
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.main import app

client = TestClient(app)


def test_404_error():
    """Test 404 error handling."""
    response = client.get("/nonexistent-endpoint")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert "request_id" in data


def test_validation_error():
    """Test validation error handling."""
    # This would test a POST with invalid data
    # Placeholder for when we have POST endpoints
    pass


def test_cors_headers():
    """Test CORS headers are present."""
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:3000",
            "Access-Control-Request-Method": "GET",
        }
    )
    assert "access-control-allow-origin" in response.headers


def test_request_id_header():
    """Test request ID is added to response."""
    response = client.get("/health")
    assert "x-request-id" in response.headers
    
    # Test with custom request ID
    custom_id = "test-request-123"
    response = client.get("/health", headers={"X-Request-ID": custom_id})
    assert response.headers["x-request-id"] == custom_id


def test_custom_exceptions():
    """Test custom exception classes."""
    # Test NotFoundError
    exc = NotFoundError("User", 123)
    assert exc.status_code == 404
    assert "User" in exc.message
    
    # Test ValidationError
    exc = ValidationError("Invalid email", field="email")
    assert exc.status_code == 422
    assert exc.details["field"] == "email"
    
    # Test ConflictError
    exc = ConflictError("Resource already exists", resource="User")
    assert exc.status_code == 409
    assert exc.details["resource"] == "User"
    
    # Test BadRequestError
    exc = BadRequestError("Invalid request", details={"reason": "test"})
    assert exc.status_code == 400
    assert exc.details["reason"] == "test"
```

### Step 8: Create Example Error Endpoint for Testing
Create `api/app/routes/debug.py` (only for development):

```python
"""Debug routes for testing error handling (development only)."""

from fastapi import APIRouter, HTTPException

from app.config import get_settings
from app.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    InternalServerError,
    NotFoundError,
    ServiceUnavailableError,
    UnauthorizedError,
    ValidationError,
)

settings = get_settings()

# Only create router in development
if settings.is_development:
    router = APIRouter(
        prefix="/debug",
        tags=["Debug"],
    )
    
    @router.get("/error/{error_type}")
    async def trigger_error(error_type: str):
        """Trigger various error types for testing."""
        
        if error_type == "not_found":
            raise NotFoundError("TestResource", "123")
        elif error_type == "validation":
            raise ValidationError("Invalid input", field="test_field")
        elif error_type == "conflict":
            raise ConflictError("Resource conflict")
        elif error_type == "unauthorized":
            raise UnauthorizedError()
        elif error_type == "forbidden":
            raise ForbiddenError()
        elif error_type == "bad_request":
            raise BadRequestError("Bad request test")
        elif error_type == "internal":
            raise InternalServerError("Internal error test")
        elif error_type == "unavailable":
            raise ServiceUnavailableError(retry_after=60)
        elif error_type == "http":
            raise HTTPException(status_code=418, detail="I'm a teapot")
        elif error_type == "general":
            raise Exception("General exception test")
        else:
            return {"message": f"Unknown error type: {error_type}"}
else:
    router = None
```

Add to main.py if in development:
```python
# In setup_routes function
if settings.is_development:
    from app.routes import debug
    if debug.router:
        app.include_router(debug.router)
```

## Success Criteria
- [ ] Custom exception classes created
- [ ] Error response models defined
- [ ] CORS middleware properly configured
- [ ] Error handlers for all exception types
- [ ] Request ID middleware implemented
- [ ] Main application updated with new middleware
- [ ] Tests for error handling created
- [ ] CORS allows frontend communication
- [ ] All errors return consistent JSON format
- [ ] Request IDs present in all responses

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check new files exist
ls -la api/app/exceptions.py
ls -la api/app/models/errors.py
ls -la api/app/middleware/cors.py
ls -la api/app/middleware/error_handlers.py
ls -la api/app/middleware/request_id.py
ls -la api/tests/test_error_handling.py

# Run the application
cd api
uvicorn app.main:app --reload &
sleep 5

# Test CORS preflight request
curl -X OPTIONS http://localhost:8000/health \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Content-Type" \
  -v 2>&1 | grep -i "access-control"

# Test error responses
curl -X GET http://localhost:8000/nonexistent -v
curl -X GET http://localhost:8000/debug/not_found -v
curl -X GET http://localhost:8000/debug/validation -v

# Check request ID header
curl -X GET http://localhost:8000/health -v 2>&1 | grep -i "x-request-id"

# Run tests
pytest tests/test_error_handling.py -v

# Kill the server
pkill -f uvicorn
```

## Troubleshooting
- If CORS errors persist, check origin URLs match exactly
- Ensure middleware order is correct (request ID before CORS)
- If errors aren't caught, check exception inheritance
- For missing headers, verify middleware is properly added
- If tests fail, ensure development mode is enabled

## Notes
- CORS origins must match exactly (including protocol and port)
- Request ID helps with debugging and log correlation
- Don't expose internal details in production error messages
- Consider rate limiting for production deployment
- Debug routes should never be exposed in production
- Error logging is crucial for debugging production issues

## Next Steps
After completing this task, proceed to:
- Task 07: Configure logging system for the API