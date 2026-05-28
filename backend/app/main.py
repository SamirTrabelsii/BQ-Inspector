from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.engine.duckdb_engine import duckdb_engine
from app.storage.metadata_store import metadata_store
from app.models.node import NodeStatus
from app.api import bigquery as bq_api
from app.api import edges, execution, nodes

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-8s %(name)s %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("=== ZouGomaDataPlatform starting ===")
    for d in [settings.cache_dir, Path(settings.duckdb_path).parent, Path(settings.metadata_db_path).parent]:
        Path(d).mkdir(parents=True, exist_ok=True)

    await metadata_store.initialize()
    await duckdb_engine.initialize()

    # Reset any nodes left in RUNNING state from a previous crashed session
    all_nodes = await metadata_store.get_all_nodes()
    reset_count = 0
    for node in all_nodes:
        if node.status == NodeStatus.RUNNING:
            node.status = NodeStatus.IDLE
            node.error_message = "Reset: server restarted during execution. Please re-run."
            await metadata_store.save_node(node)
            reset_count += 1
    if reset_count:
        logger.warning(f"Reset {reset_count} zombie RUNNING node(s) to IDLE")

    logger.info(f"cache_dir={settings.cache_dir}  duckdb={settings.duckdb_path}")
    logger.info("=== startup complete ===")
    yield
    duckdb_engine.close()

app = FastAPI(title="ZouGomaDataPlatform", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(nodes.router,     prefix="/api")
app.include_router(edges.router,     prefix="/api")
app.include_router(execution.router, prefix="/api")
app.include_router(bq_api.router,    prefix="/api")

@app.get("/api/health", tags=["system"])
async def health():
    return {"status": "ok", "version": "0.1.0"}
