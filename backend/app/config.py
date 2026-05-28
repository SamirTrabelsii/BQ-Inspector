from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    data_dir: str           = "../data"
    cache_dir: str          = "../data/cache"
    duckdb_path: str        = "../data/duckdb/analytics.db"
    metadata_db_path: str   = "../data/metadata/store.db"
    preview_rows: int       = 500

    model_config = {
        # Looks for .env in the backend/ directory
        "env_file": str(Path(__file__).parent.parent / ".env"),
        "env_file_encoding": "utf-8",
    }


settings = Settings()
