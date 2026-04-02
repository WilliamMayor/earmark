"""Uvicorn entry point for the sync service."""

import uvicorn

from .api import app


def start() -> None:
    uvicorn.run(app, host="0.0.0.0", port=8080)
