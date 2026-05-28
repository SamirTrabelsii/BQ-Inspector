from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any, Dict, List, Optional

import duckdb
import pyarrow as pa

from app.config import settings
from app.models.node import ColumnInfo

logger = logging.getLogger(__name__)

_TYPE_MAP = {
    "INTEGER": "integer", "BIGINT": "integer", "HUGEINT": "integer",
    "UBIGINT": "integer", "SMALLINT": "integer", "TINYINT": "integer",
    "UINTEGER": "integer", "DOUBLE": "float", "FLOAT": "float",
    "DECIMAL": "float", "NUMERIC": "float", "VARCHAR": "string",
    "TEXT": "string", "CHAR": "string", "BLOB": "string",
    "BOOLEAN": "boolean", "DATE": "date", "TIMESTAMP": "timestamp",
    "TIMESTAMP WITH TIME ZONE": "timestamp", "TIMESTAMPTZ": "timestamp",
    "TIME": "time", "JSON": "json", "MAP": "json", "STRUCT": "json", "LIST": "json",
}

def _normalize_type(duck_type: str) -> str:
    upper = duck_type.upper().strip()
    for key, val in _TYPE_MAP.items():
        if key in upper:
            return val
    return "string"

def _to_posix(path: str) -> str:
    return Path(path).as_posix()


class DuckDBEngine:
    def __init__(self) -> None:
        self._conn: Optional[duckdb.DuckDBPyConnection] = None
        self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="duckdb")

    async def initialize(self) -> None:
        await asyncio.to_thread(self._init_sync)

    def _init_sync(self) -> None:
        db_path = Path(settings.duckdb_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = duckdb.connect(str(db_path))
        self._conn.execute("SET enable_progress_bar=false")
        logger.info("DuckDB connected -> %s", db_path)
        try:
            self._conn.execute("INSTALL httpfs; LOAD httpfs;")
        except Exception:
            pass
        cache_dir = Path(settings.cache_dir)
        if cache_dir.exists():
            registered = 0
            for pf in cache_dir.glob("node_*.parquet"):
                node_id = pf.stem.removeprefix("node_")
                try:
                    self._conn.execute(
                        'CREATE OR REPLACE VIEW "node_{id}" AS SELECT * FROM read_parquet(\'{p}\')'.format(
                            id=node_id, p=pf.as_posix()
                        )
                    )
                    registered += 1
                except Exception as e:
                    logger.warning("Could not re-register %s: %s", pf.name, e)
            logger.info("Re-registered %d cached node(s)", registered)

    def close(self) -> None:
        if self._conn:
            self._conn.close()

    async def register_node(self, node_id: str, parquet_path: str) -> None:
        posix = _to_posix(parquet_path)
        loop  = asyncio.get_running_loop()
        await loop.run_in_executor(self._executor, self._register_sync, node_id, posix)

    def _register_sync(self, node_id: str, posix_path: str) -> None:
        self._conn.execute(
            'CREATE OR REPLACE VIEW "node_{id}" AS SELECT * FROM read_parquet(\'{p}\')'.format(
                id=node_id, p=posix_path
            )
        )
        logger.info("Registered view node_%s", node_id)

    async def unregister_node(self, node_id: str) -> None:
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(
            self._executor,
            lambda: self._conn.execute('DROP VIEW IF EXISTS "node_{}"'.format(node_id)),
        )

    async def execute(self, sql: str) -> pa.Table:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._execute_sync, sql)

    def _execute_sync(self, sql: str) -> pa.Table:
        return self._conn.execute(sql).arrow()

    async def get_schema(self, node_id: str) -> List[ColumnInfo]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._schema_sync, node_id)

    def _schema_sync(self, node_id: str) -> List[ColumnInfo]:
        rows = self._conn.execute('DESCRIBE "node_{}"'.format(node_id)).fetchall()
        return [
            ColumnInfo(name=r[0], type=_normalize_type(str(r[1])), nullable=(r[2] == "YES"))
            for r in rows
        ]

    async def get_row_count(self, node_id: str) -> int:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._count_sync, node_id)

    def _count_sync(self, node_id: str) -> int:
        return self._conn.execute('SELECT COUNT(*) FROM "node_{}"'.format(node_id)).fetchone()[0]

    async def get_preview(self, node_id: str, limit: int = 200, offset: int = 0) -> Dict[str, Any]:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._preview_sync, node_id, limit, offset)

    def _preview_sync(self, node_id: str, limit: int, offset: int) -> Dict[str, Any]:
        rel     = self._conn.execute('SELECT * FROM "node_{}" LIMIT {} OFFSET {}'.format(node_id, limit, offset))
        columns = [{"name": d[0], "type": _normalize_type(str(d[1]))} for d in rel.description]
        rows    = [list(r) for r in rel.fetchall()]
        return {"columns": columns, "rows": rows}

    async def get_profile(self, node_id: str) -> list:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._profile_sync, node_id)

    def _profile_sync(self, node_id: str) -> list:
        view = '"node_{}"'.format(node_id)
        rel  = self._conn.execute("SUMMARIZE {}".format(view))
        idx  = {d[0]: i for i, d in enumerate(rel.description)}
        summ = rel.fetchall()
        if not summ:
            return []
        total    = self._conn.execute("SELECT COUNT(*) FROM {}".format(view)).fetchone()[0]
        i_name   = idx.get("column_name",     0)
        i_type   = idx.get("column_type",     1)
        i_min    = idx.get("min",             2)
        i_max    = idx.get("max",             3)
        i_unique = idx.get("approx_unique",   4)
        i_nullp  = idx.get("null_percentage", 5)
        str_cols = [r[i_name] for r in summ
                    if any(t in str(r[i_type]).upper() for t in ("VARCHAR", "TEXT", "CHAR"))]
        trim_data: dict = {}
        if str_cols and total > 0:
            parts = [
                'SUM(CASE WHEN "{c}" IS NOT NULL AND "{c}"!=TRIM("{c}") THEN 1 ELSE 0 END)'.format(c=c)
                for c in str_cols
            ]
            res = self._conn.execute("SELECT {} FROM {}".format(",".join(parts), view)).fetchone()
            trim_data = {col: int(res[i] or 0) for i, col in enumerate(str_cols)}
        profile = []
        for r in summ:
            col = r[i_name]
            try:
                null_pct = float(str(r[i_nullp]).replace("%", "").strip())
            except (TypeError, ValueError):
                null_pct = 0.0
            profile.append({
                "column":       col,
                "type":         _normalize_type(str(r[i_type])),
                "total":        total,
                "null_count":   round(null_pct / 100 * total),
                "null_pct":     round(null_pct, 1),
                "unique_count": int(r[i_unique]) if r[i_unique] is not None else 0,
                "min":          str(r[i_min]) if r[i_min] is not None else None,
                "max":          str(r[i_max]) if r[i_max] is not None else None,
                "trim_count":   trim_data.get(col),
            })
        return profile

    async def search(self, node_id: str, q: str, column: str, limit: int, offset: int) -> dict:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(self._executor, self._search_sync, node_id, q, column, limit, offset)

    def _search_sync(self, node_id: str, q: str, column: str, limit: int, offset: int) -> dict:
        view   = '"node_{}"'.format(node_id)
        safe_q = q.replace("'", "''")
        schema = self._conn.execute("DESCRIBE {}".format(view)).fetchall()
        if column:
            where = 'CAST("{}" AS VARCHAR) ILIKE \'%{}%\''.format(column, safe_q)
        else:
            parts = ['CAST("{}" AS VARCHAR) ILIKE \'%{}%\''.format(r[0], safe_q) for r in schema]
            where = " OR ".join(parts)
        total = self._conn.execute(
            "SELECT COUNT(*) FROM {} WHERE {}".format(view, where)
        ).fetchone()[0]
        rel   = self._conn.execute(
            "SELECT * FROM {} WHERE {} LIMIT {} OFFSET {}".format(view, where, limit, offset)
        )
        cols  = [{"name": d[0], "type": _normalize_type(str(d[1]))} for d in rel.description]
        rows  = [list(r) for r in rel.fetchall()]
        return {"columns": cols, "rows": rows, "total_matches": int(total)}

    async def diff(self, node_a: str, node_b: str, key_col: str,
                   status_filter: str, limit: int, offset: int) -> dict:
        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(
            self._executor, self._diff_sync,
            node_a, node_b, key_col, status_filter, limit, offset
        )

    def _diff_sync(self, node_a: str, node_b: str, key_col: str,
                   status_filter: str, limit: int, offset: int) -> dict:
        va = '"node_{}"'.format(node_a)
        vb = '"node_{}"'.format(node_b)
        schema_a = [r[0] for r in self._conn.execute("DESCRIBE {}".format(va)).fetchall()]
        schema_b = [r[0] for r in self._conn.execute("DESCRIBE {}".format(vb)).fetchall()]
        common   = [c for c in schema_a if c in schema_b]
        if key_col not in schema_a:
            raise ValueError("Key column '{}' not found in node A".format(key_col))
        non_key     = [c for c in common if c != key_col]
        change_cond = " OR ".join(
            'a."{c}" IS DISTINCT FROM b."{c}"'.format(c=c) for c in non_key
        ) if non_key else "false"
        join = (
            "FROM {va} a "
            "FULL OUTER JOIN {vb} b "
            "ON CAST(a.\"{k}\" AS VARCHAR) = CAST(b.\"{k}\" AS VARCHAR)"
        ).format(va=va, vb=vb, k=key_col)
        status_expr = (
            "CASE "
            "WHEN b.\"{k}\" IS NULL THEN 'added' "
            "WHEN a.\"{k}\" IS NULL THEN 'removed' "
            "WHEN {cc}              THEN 'changed' "
            "ELSE                        'unchanged' "
            "END"
        ).format(k=key_col, cc=change_cond)
        s = self._conn.execute(
            "SELECT "
            "COUNT(CASE WHEN b.\"{k}\" IS NULL THEN 1 END), "
            "COUNT(CASE WHEN a.\"{k}\" IS NULL THEN 1 END), "
            "COUNT(CASE WHEN a.\"{k}\" IS NOT NULL AND b.\"{k}\" IS NOT NULL AND ({cc}) THEN 1 END), "
            "COUNT(CASE WHEN a.\"{k}\" IS NOT NULL AND b.\"{k}\" IS NOT NULL AND NOT ({cc}) THEN 1 END) "
            "{join}".format(k=key_col, cc=change_cond, join=join)
        ).fetchone()
        summary = {
            "added": int(s[0] or 0), "removed": int(s[1] or 0),
            "changed": int(s[2] or 0), "unchanged": int(s[3] or 0),
        }
        summary["total"] = sum(summary.values())
        a_sel = ", ".join('a."{c}" AS "A__{c}"'.format(c=c) for c in common)
        b_sel = ", ".join('b."{c}" AS "B__{c}"'.format(c=c) for c in common)
        base  = "SELECT ({st}) AS __status, {a}, {b} {j}".format(
            st=status_expr, a=a_sel, b=b_sel, j=join
        )
        where   = "WHERE __status='{}'".format(status_filter) \
                  if status_filter not in ("", "all") else ""
        total_f = self._conn.execute(
            "SELECT COUNT(*) FROM ({}) t {}".format(base, where)
        ).fetchone()[0]
        rel     = self._conn.execute(
            "SELECT * FROM ({}) t {} LIMIT {} OFFSET {}".format(base, where, limit, offset)
        )
        col_idx = {d[0]: i for i, d in enumerate(rel.description)}
        rows = []
        for raw in rel.fetchall():
            status = raw[col_idx["__status"]]
            vals, old_vals, changed_cols = {}, {}, []
            for c in common:
                av = raw[col_idx.get("A__{}".format(c), 0)]
                bv = raw[col_idx.get("B__{}".format(c), 0)]
                display = bv if status == "removed" else av
                vals[c]     = None if display is None else str(display)
                old_vals[c] = None if bv is None else str(bv)
                if status == "changed" and av != bv:
                    changed_cols.append(c)
            rows.append({
                "status":       status,
                "values":       vals,
                "old_values":   old_vals if status == "changed" else None,
                "changed_cols": changed_cols,
            })
        return {
            "summary": summary, "columns": common,
            "rows": rows, "total_filtered": int(total_f),
        }


duckdb_engine = DuckDBEngine()