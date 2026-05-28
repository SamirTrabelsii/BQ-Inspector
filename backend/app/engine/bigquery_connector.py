from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import pyarrow as pa

logger = logging.getLogger(__name__)


class BigQueryConnector:
    """BigQuery connector using Application Default Credentials (ADC).

    Windows-safe: we explicitly disable the BQ Storage API (gRPC) because it
    causes silent hangs when called from a ThreadPoolExecutor inside an asyncio
    event loop on Windows. We use the standard REST paginated download instead.
    This is slightly slower for very large results but works reliably everywhere.
    """

    def __init__(self) -> None:
        self._client = None

    def _get_client(self, project: Optional[str] = None):
        from google.cloud import bigquery
        if project:
            return bigquery.Client(project=project)
        if self._client is None:
            self._client = bigquery.Client()
        return self._client

    @property
    def is_available(self) -> bool:
        try:
            self._get_client()
            return True
        except Exception:
            return False

    def execute_query(self, sql: str, project: Optional[str] = None) -> pa.Table:
        """Execute a BQ query and return a PyArrow table.

        Uses create_bqstorage_client=False to avoid gRPC threading issues on Windows.
        Row download goes through the standard REST API which is stable in all envs.
        """
        from google.cloud import bigquery

        client = self._get_client(project)
        logger.info(f"[bq] submitting query (project={project or 'default'})...")

        job_config = bigquery.QueryJobConfig()
        query_job = client.query(sql, job_config=job_config)

        logger.info(f"[bq] job_id={query_job.job_id} — waiting for completion...")
        result = query_job.result()  # blocks until BQ job finishes
        logger.info(f"[bq] job complete — downloading results via REST API...")

        # create_bqstorage_client=False  ← disables gRPC / Storage API
        # dtypes=None                    ← let BQ infer types
        df = result.to_dataframe(create_bqstorage_client=False, progress_bar_type=None)
        logger.info(f"[bq] downloaded {len(df)} rows, {len(df.columns)} columns")

        table = pa.Table.from_pandas(df, preserve_index=False)
        logger.info(f"[bq] converted to Arrow table ({table.nbytes / 1024 / 1024:.1f} MB)")
        return table

    def list_projects(self) -> List[Dict[str, Any]]:
        try:
            from google.cloud import resourcemanager_v3
            rm = resourcemanager_v3.ProjectsClient()
            return [
                {"id": p.project_id, "name": p.display_name, "state": p.state.name}
                for p in rm.search_projects()
                if p.state.name == "ACTIVE"
            ]
        except Exception as exc:
            raise RuntimeError(f"Could not list projects: {exc}") from exc

    def list_datasets(self, project: str) -> List[Dict[str, str]]:
        client = self._get_client(project)
        return [{"id": ds.dataset_id, "project": project}
                for ds in client.list_datasets(project=project)]

    def list_tables(self, project: str, dataset: str) -> List[Dict[str, str]]:
        client = self._get_client(project)
        return [{"id": t.table_id, "dataset": dataset, "project": project}
                for t in client.list_tables(f"{project}.{dataset}")]

    def get_table_schema(self, project: str, dataset: str, table: str) -> List[Dict[str, str]]:
        client = self._get_client(project)
        tbl = client.get_table(f"{project}.{dataset}.{table}")
        return [{"name": f.name, "type": f.field_type, "mode": f.mode}
                for f in tbl.schema]


bq_connector = BigQueryConnector()
