"""FastAPI sync service — HTTP endpoints and APScheduler-based hourly sync."""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException

from .client import LunchflowClient
from .config import load_config
from .db import get_connection, init_schema, upsert_account
from .sync import sync_all

_lock = asyncio.Lock()


def do_sync() -> dict:
    """Run a full sync and return a structured result dict."""
    config = load_config()
    conn = get_connection(config.db_path)
    init_schema(conn)

    try:
        with LunchflowClient(config.api_key) as client:
            for api_account in client.list_accounts():
                upsert_account(conn, api_account)
            results = sync_all(conn, client)
    finally:
        conn.close()

    total = sum(r.get("upserted", 0) for r in results)
    errors = [r["error"] for r in results if "error" in r]

    return {
        "total_upserted": total,
        "accounts_synced": len(results),
        "errors": errors,
    }


async def _run_sync() -> dict:
    """Acquire lock and run do_sync() in the thread pool."""
    loop = asyncio.get_running_loop()
    async with _lock:
        return await loop.run_in_executor(None, do_sync)


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler = AsyncIOScheduler()
    scheduler.add_job(_run_sync, "cron", minute=0)
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(lifespan=lifespan)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.post("/sync")
async def sync() -> dict:
    try:
        return await _run_sync()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
