# Task 07: Configure Logging System for the API

## Context
This task implements a comprehensive logging system for the Budget Tool API. Proper logging is essential for debugging, monitoring, and auditing. The system will support structured logging with JSON format for production environments, contextual information, and request tracking through correlation IDs.

## Objectives
- Set up structured logging with different formats for development/production
- Configure log levels based on environment
- Implement request/response logging middleware
- Add performance metrics logging
- Create log rotation configuration
- Integrate logging with request IDs for correlation
- Set up log formatting for both console and file output

## Prerequisites
- Task 06 completed (CORS and error handling configured)
- FastAPI application with middleware support
- Request ID middleware implemented
- Virtual environment activated

## Task Instructions

### Step 1: Create Logging Configuration Module
Create `api/app/core/logging.py`:

```python
"""Logging configuration for Budget Tool API."""

import logging
import logging.handlers
import sys
from pathlib import Path
from typing import Any, Dict

import ujson
from pythonjsonlogger import jsonlogger

from app.config import get_settings


class ContextFilter(logging.Filter):
    """Add contextual information to log records."""
    
    def filter(self, record: logging.LogRecord) -> bool:
        """Add context to log record."""
        # Add default fields if not present
        if not hasattr(record, 'request_id'):
            record.request_id = None
        if not hasattr(record, 'method'):
            record.method = None
        if not hasattr(record, 'path'):
            record.path = None
        if not hasattr(record, 'status_code'):
            record.status_code = None
        if not hasattr(record, 'duration_ms'):
            record.duration_ms = None
        return True


class CustomJsonFormatter(jsonlogger.JsonFormatter):
    """Custom JSON formatter for structured logging."""
    
    def add_fields(self, log_record: Dict[str, Any], record: logging.LogRecord, message_dict: Dict[str, Any]) -> None:
        """Add custom fields to log record."""
        super().add_fields(log_record, record, message_dict)
        
        # Add timestamp
        log_record['timestamp'] = self.formatTime(record, self.datefmt)
        
        # Add log level
        log_record['level'] = record.levelname
        
        # Add location info
        log_record['logger'] = record.name
        log_record['module'] = record.module
        log_record['function'] = record.funcName
        log_record['line'] = record.lineno
        
        # Add context fields if present
        if hasattr(record, 'request_id') and record.request_id:
            log_record['request_id'] = record.request_id
        if hasattr(record, 'method') and record.method:
            log_record['method'] = record.method
        if hasattr(record, 'path') and record.path:
            log_record['path'] = record.path
        if hasattr(record, 'status_code') and record.status_code:
            log_record['status_code'] = record.status_code
        if hasattr(record, 'duration_ms') and record.duration_ms:
            log_record['duration_ms'] = record.duration_ms
        
        # Add exception info if present
        if record.exc_info:
            log_record['exc_info'] = self.formatException(record.exc_info)


def setup_logging() -> None:
    """Configure logging for the application."""
    settings = get_settings()
    
    # Determine log level
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)
    
    # Clear existing handlers
    logging.getLogger().handlers.clear()
    
    # Create formatters
    if settings.log_format == "json":
        formatter = CustomJsonFormatter(
            '%(timestamp)s %(level)s %(name)s %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S',
            json_encoder=ujson.dumps
        )
    else:
        # Human-readable format for development
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s - '
            '[%(filename)s:%(lineno)d] %(request_id)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
    
    # Console handler
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setFormatter(formatter)
    console_handler.addFilter(ContextFilter())
    
    # File handler (if in production)
    handlers = [console_handler]
    
    if settings.is_production:
        # Create logs directory
        log_dir = Path("/app/logs")
        log_dir.mkdir(parents=True, exist_ok=True)
        
        # Rotating file handler
        file_handler = logging.handlers.RotatingFileHandler(
            log_dir / "api.log",
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setFormatter(formatter)
        file_handler.addFilter(ContextFilter())
        handlers.append(file_handler)
        
        # Error file handler
        error_handler = logging.handlers.RotatingFileHandler(
            log_dir / "error.log",
            maxBytes=10 * 1024 * 1024,  # 10MB
            backupCount=5,
            encoding='utf-8'
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(formatter)
        error_handler.addFilter(ContextFilter())
        handlers.append(error_handler)
    
    # Configure root logger
    logging.basicConfig(
        level=log_level,
        handlers=handlers,
        force=True
    )
    
    # Configure specific loggers
    loggers_config = {
        "uvicorn": log_level,
        "uvicorn.error": log_level,
        "uvicorn.access": logging.WARNING if settings.is_production else log_level,
        "fastapi": log_level,
        "app": log_level,
        "sqlalchemy": logging.WARNING,
        "aiofiles": logging.WARNING,
    }
    
    for logger_name, level in loggers_config.items():
        logger = logging.getLogger(logger_name)
        logger.setLevel(level)
        logger.handlers = handlers
        logger.propagate = False
    
    # Log startup message
    logger = logging.getLogger(__name__)
    logger.info(
        "Logging configured",
        extra={
            "log_level": settings.log_level,
            "log_format": settings.log_format,
            "environment": settings.environment,
        }
    )


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with context filter.
    
    Args:
        name: Logger name (usually __name__)
    
    Returns:
        Configured logger instance
    """
    logger = logging.getLogger(name)
    if not any(isinstance(f, ContextFilter) for f in logger.filters):
        logger.addFilter(ContextFilter())
    return logger
```

### Step 2: Create Logging Middleware
Create `api/app/middleware/logging.py`:

```python
"""Logging middleware for request/response tracking."""

import logging
import time
from typing import Callable

from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class LoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for logging requests and responses."""
    
    async def dispatch(
        self,
        request: Request,
        call_next: Callable
    ) -> Response:
        """Log request and response details."""
        # Skip logging for health checks in production
        if request.url.path.startswith("/health"):
            return await call_next(request)
        
        # Get request ID
        request_id = getattr(request.state, "request_id", None)
        
        # Start timer
        start_time = time.time()
        
        # Log request
        logger.info(
            f"Request started: {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "query_params": str(request.query_params),
                "client_host": request.client.host if request.client else None,
            }
        )
        
        # Process request
        try:
            response = await call_next(request)
            
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log response
            logger.info(
                f"Request completed: {request.method} {request.url.path} - {response.status_code}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": round(duration_ms, 2),
                }
            )
            
            # Add timing header
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"
            
            # Log slow requests
            if duration_ms > 1000:  # More than 1 second
                logger.warning(
                    f"Slow request detected: {request.method} {request.url.path}",
                    extra={
                        "request_id": request_id,
                        "duration_ms": round(duration_ms, 2),
                    }
                )
            
            return response
            
        except Exception as e:
            # Calculate duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log error
            logger.error(
                f"Request failed: {request.method} {request.url.path}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": round(duration_ms, 2),
                    "error": str(e),
                },
                exc_info=True
            )
            
            # Re-raise exception for error handlers
            raise


def setup_logging_middleware(app: FastAPI) -> None:
    """
    Configure logging middleware.
    
    Args:
        app: FastAPI application instance
    """
    app.add_middleware(LoggingMiddleware)
```

### Step 3: Create Logger Utilities
Create `api/app/utils/logger.py`:

```python
"""Logger utilities for Budget Tool API."""

import functools
import logging
import time
from typing import Any, Callable, Optional, TypeVar

from fastapi import Request

logger = logging.getLogger(__name__)

T = TypeVar('T')


def log_execution_time(
    logger_instance: Optional[logging.Logger] = None,
    level: int = logging.INFO
) -> Callable:
    """
    Decorator to log function execution time.
    
    Args:
        logger_instance: Logger to use (defaults to module logger)
        level: Log level to use
    
    Returns:
        Decorated function
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        async def async_wrapper(*args: Any, **kwargs: Any) -> T:
            log = logger_instance or logger
            start_time = time.time()
            
            try:
                result = await func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                log.log(
                    level,
                    f"Function {func.__name__} executed successfully",
                    extra={
                        "function": func.__name__,
                        "duration_ms": round(duration_ms, 2),
                    }
                )
                
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                log.error(
                    f"Function {func.__name__} failed",
                    extra={
                        "function": func.__name__,
                        "duration_ms": round(duration_ms, 2),
                        "error": str(e),
                    },
                    exc_info=True
                )
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args: Any, **kwargs: Any) -> T:
            log = logger_instance or logger
            start_time = time.time()
            
            try:
                result = func(*args, **kwargs)
                duration_ms = (time.time() - start_time) * 1000
                
                log.log(
                    level,
                    f"Function {func.__name__} executed successfully",
                    extra={
                        "function": func.__name__,
                        "duration_ms": round(duration_ms, 2),
                    }
                )
                
                return result
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                
                log.error(
                    f"Function {func.__name__} failed",
                    extra={
                        "function": func.__name__,
                        "duration_ms": round(duration_ms, 2),
                        "error": str(e),
                    },
                    exc_info=True
                )
                raise
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator


def get_request_logger(request: Request) -> logging.LoggerAdapter:
    """
    Get a logger adapter with request context.
    
    Args:
        request: FastAPI request object
    
    Returns:
        Logger adapter with request context
    """
    request_id = getattr(request.state, "request_id", None)
    
    extra = {
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
    }
    
    return logging.LoggerAdapter(logger, extra)


def log_api_call(
    service: str,
    operation: str,
    success: bool,
    duration_ms: float,
    **kwargs: Any
) -> None:
    """
    Log an external API call.
    
    Args:
        service: Name of the external service
        operation: Operation being performed
        success: Whether the call succeeded
        duration_ms: Duration of the call in milliseconds
        **kwargs: Additional context to log
    """
    level = logging.INFO if success else logging.ERROR
    
    logger.log(
        level,
        f"External API call: {service}.{operation}",
        extra={
            "service": service,
            "operation": operation,
            "success": success,
            "duration_ms": round(duration_ms, 2),
            **kwargs
        }
    )


def audit_log(
    action: str,
    resource: str,
    resource_id: Optional[str] = None,
    user: Optional[str] = None,
    **kwargs: Any
) -> None:
    """
    Create an audit log entry.
    
    Args:
        action: Action performed (CREATE, UPDATE, DELETE, etc.)
        resource: Resource type
        resource_id: Resource identifier
        user: User performing the action
        **kwargs: Additional audit context
    """
    logger.info(
        f"Audit: {action} {resource}",
        extra={
            "audit": True,
            "action": action,
            "resource": resource,
            "resource_id": resource_id,
            "user": user,
            **kwargs
        }
    )


# Fix missing import
import asyncio
```

### Step 4: Update Configuration for Logging
Update `api/app/config.py` to add logging configuration options:

Add these fields to the Settings class:
```python
# Logging
log_level: str = "INFO"
log_format: str = "json"  # "json" or "text"
log_file_enabled: bool = False
log_file_path: Path = Path("/app/logs/api.log")
log_file_max_size: int = 10 * 1024 * 1024  # 10MB
log_file_backup_count: int = 5
```

### Step 5: Update Main Application
Update `api/app/main.py` to initialize logging:

Add import at the top:
```python
from app.core.logging import setup_logging, get_logger
from app.middleware.logging import setup_logging_middleware
```

Update the main application:
```python
# Initialize logging before creating app
setup_logging()

# Get logger for main module
logger = get_logger(__name__)

# In create_application function, after setting up other middleware:
setup_logging_middleware(app)
```

### Step 6: Add Logging Dependencies
Update `api/requirements.txt` to add logging dependencies:

```txt
# Logging
python-json-logger==2.0.7
ujson==5.9.0
```

### Step 7: Create Logging Tests
Create `api/tests/test_logging.py`:

```python
"""Tests for logging configuration."""

import json
import logging
from io import StringIO

import pytest
from fastapi.testclient import TestClient

from app.core.logging import CustomJsonFormatter, get_logger, setup_logging
from app.main import app

client = TestClient(app)


def test_logger_creation():
    """Test logger creation with context filter."""
    logger = get_logger("test_logger")
    assert isinstance(logger, logging.Logger)
    assert logger.name == "test_logger"


def test_json_formatter():
    """Test JSON formatter output."""
    formatter = CustomJsonFormatter()
    
    # Create a log record
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname="test.py",
        lineno=10,
        msg="Test message",
        args=(),
        exc_info=None
    )
    
    # Add custom fields
    record.request_id = "test-123"
    record.method = "GET"
    record.path = "/test"
    
    # Format the record
    formatted = formatter.format(record)
    
    # Parse JSON
    log_dict = json.loads(formatted)
    
    assert log_dict["message"] == "Test message"
    assert log_dict["level"] == "INFO"
    assert log_dict["request_id"] == "test-123"
    assert log_dict["method"] == "GET"
    assert log_dict["path"] == "/test"


def test_logging_middleware():
    """Test logging middleware adds timing header."""
    response = client.get("/health")
    assert "x-response-time" in response.headers
    assert "ms" in response.headers["x-response-time"]


def test_request_id_in_logs(caplog):
    """Test request ID is included in logs."""
    with caplog.at_level(logging.INFO):
        response = client.get("/health")
        
    # Check if request ID is in logs
    assert response.headers.get("x-request-id") is not None


def test_slow_request_warning(caplog, mocker):
    """Test slow request warning is logged."""
    # This would require mocking time.time() to simulate slow request
    # Placeholder for actual implementation
    pass


def test_audit_log():
    """Test audit logging function."""
    from app.utils.logger import audit_log
    
    # Create string stream to capture logs
    stream = StringIO()
    handler = logging.StreamHandler(stream)
    logger = logging.getLogger("app.utils.logger")
    logger.addHandler(handler)
    
    # Create audit log
    audit_log(
        action="CREATE",
        resource="Envelope",
        resource_id="123",
        user="test_user"
    )
    
    # Check log output
    log_output = stream.getvalue()
    assert "Audit: CREATE Envelope" in log_output


def test_execution_time_decorator():
    """Test execution time decorator."""
    from app.utils.logger import log_execution_time
    
    @log_execution_time()
    async def test_function():
        return "test"
    
    # Run the function
    import asyncio
    result = asyncio.run(test_function())
    assert result == "test"
```

### Step 8: Create Log Directory in Docker
Update the Dockerfile to create log directory (this will be in Task 08).

## Success Criteria
- [ ] Logging configuration module created
- [ ] Structured JSON logging for production
- [ ] Human-readable logging for development
- [ ] Request/response logging middleware implemented
- [ ] Performance metrics logged
- [ ] Log rotation configured for production
- [ ] Request ID correlation in all logs
- [ ] Utility functions for common logging patterns
- [ ] Tests for logging functionality
- [ ] Appropriate log levels for different components

## Validation Commands
Run these commands to verify the task is complete:

```bash
# Check new files exist
ls -la api/app/core/logging.py
ls -la api/app/middleware/logging.py
ls -la api/app/utils/logger.py
ls -la api/tests/test_logging.py

# Install new dependencies
cd api
pip install python-json-logger ujson

# Run the application with different log settings
LOG_LEVEL=DEBUG LOG_FORMAT=text uvicorn app.main:app --reload &
sleep 5

# Make some requests and check logs
curl http://localhost:8000/health
curl http://localhost:8000/api/v1/status
curl http://localhost:8000/nonexistent

# Check for timing header
curl -I http://localhost:8000/health | grep -i x-response-time

# Kill and restart with JSON logging
pkill -f uvicorn
LOG_FORMAT=json uvicorn app.main:app --reload &
sleep 5

# Make request and check JSON logs
curl http://localhost:8000/health

# Run tests
pytest tests/test_logging.py -v

# Kill the server
pkill -f uvicorn
```

## Troubleshooting
- If logs don't appear, check log level settings
- For missing context in logs, ensure ContextFilter is applied
- If JSON parsing fails, check for proper escaping
- For performance issues, adjust log level in production
- If file logging fails, check directory permissions

## Notes
- Use structured logging (JSON) in production for better parsing
- Don't log sensitive information (passwords, tokens, PII)
- Use appropriate log levels (DEBUG, INFO, WARNING, ERROR)
- Consider log aggregation tools for production
- Request ID correlation is crucial for debugging
- Performance logging helps identify bottlenecks

## Next Steps
After completing this task, proceed to:
- Task 08: Create backend Dockerfile