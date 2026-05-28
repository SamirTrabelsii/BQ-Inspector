from __future__ import annotations

import logging
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

from app.config import settings

logger = logging.getLogger(__name__)


class CacheManager:
    def __init__(self) -> None:
        self.cache_dir = Path(settings.cache_dir)

    def get_cache_path(self, node_id: str) -> str:
        """Return a forward-slash path safe for DuckDB on all platforms."""
        path = self.cache_dir / f"node_{node_id}.parquet"
        # DuckDB requires forward slashes even on Windows
        return path.as_posix()

    def write(self, node_id: str, table: pa.Table) -> str:
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        path_posix = self.get_cache_path(node_id)
        # Use Path for actual OS file write (handles Windows correctly)
        pq.write_table(table, Path(path_posix), compression="snappy")
        logger.info(f"[cache] wrote {table.num_rows} rows → {path_posix}")
        return path_posix

    def delete(self, node_id: str) -> None:
        path = Path(self.get_cache_path(node_id))
        if path.exists():
            try:
                path.unlink()
                logger.info(f"[cache] deleted {path}")
            except Exception as e:
                logger.warning(f"[cache] Could not delete file {path} (it may be locked by DuckDB or another process): {e}")

    def exists(self, node_id: str) -> bool:
        return Path(self.get_cache_path(node_id)).exists()

    def size_mb(self, node_id: str) -> float:
        path = Path(self.get_cache_path(node_id))
        return path.stat().st_size / (1024 * 1024) if path.exists() else 0.0


cache_manager = CacheManager()
