import sys

def patch():
    with open('app/engine/duckdb_engine.py', 'r') as f:
        content = f.read()

    replacements = {
        'def _register_sync(self, node_id: str, posix_path: str) -> None:': 
        'def _register_sync(self, node_id: str, posix_path: str) -> None:\n        cursor = self._conn.cursor()',
        
        'lambda: self._conn.execute(\'DROP VIEW IF EXISTS "node_{}"\'.format(node_id)),':
        'lambda: self._conn.cursor().execute(\'DROP VIEW IF EXISTS "node_{}"\'.format(node_id)).close(),',

        'def _execute_sync(self, sql: str) -> pa.Table:':
        'def _execute_sync(self, sql: str) -> pa.Table:\n        cursor = self._conn.cursor()',
        
        'def _schema_sync(self, node_id: str) -> List[ColumnInfo]:':
        'def _schema_sync(self, node_id: str) -> List[ColumnInfo]:\n        cursor = self._conn.cursor()',
        
        'def _count_sync(self, node_id: str) -> int:':
        'def _count_sync(self, node_id: str) -> int:\n        cursor = self._conn.cursor()',

        'def _preview_sync(self, node_id: str, limit: int, offset: int) -> Dict[str, Any]:\n        try:':
        'def _preview_sync(self, node_id: str, limit: int, offset: int) -> Dict[str, Any]:\n        cursor = self._conn.cursor()\n        try:',
        
        'def _profile_sync(self, node_id: str) -> list:\n        try:':
        'def _profile_sync(self, node_id: str) -> list:\n        cursor = self._conn.cursor()\n        try:',
        
        'def _search_sync(self, node_id: str, q: str, column: str, limit: int, offset: int) -> dict:':
        'def _search_sync(self, node_id: str, q: str, column: str, limit: int, offset: int) -> dict:\n        cursor = self._conn.cursor()',
        
        'def _diff_sync(self, node_a: str, node_b: str, key_cols: list,\n                   status_filter: str, limit: int, offset: int) -> dict:':
        'def _diff_sync(self, node_a: str, node_b: str, key_cols: list,\n                   status_filter: str, limit: int, offset: int) -> dict:\n        cursor = self._conn.cursor()'
    }

    for k, v in replacements.items():
        if k in content:
            content = content.replace(k, v)
        else:
            print("Failed to match:", k)

    content = content.replace('self._conn.execute', 'cursor.execute')

    content = content.replace(
        'def _init_sync(self) -> None:\n        db_path = Path(settings.duckdb_path)\n        db_path.parent.mkdir(parents=True, exist_ok=True)\n        self._conn = duckdb.connect(str(db_path))\n        cursor.execute("SET enable_progress_bar=false")',
        'def _init_sync(self) -> None:\n        db_path = Path(settings.duckdb_path)\n        db_path.parent.mkdir(parents=True, exist_ok=True)\n        self._conn = duckdb.connect(str(db_path))\n        self._conn.execute("SET enable_progress_bar=false")'
    )
    content = content.replace(
        'cursor.execute("INSTALL httpfs; LOAD httpfs;")',
        'self._conn.execute("INSTALL httpfs; LOAD httpfs;")'
    )
    content = content.replace(
        'cursor.execute(\n                        \'CREATE OR REPLACE VIEW',
        'self._conn.execute(\n                        \'CREATE OR REPLACE VIEW'
    )

    with open('app/engine/duckdb_engine.py', 'w') as f:
        f.write(content)
    print('Patched successfully!')

if __name__ == "__main__":
    patch()
