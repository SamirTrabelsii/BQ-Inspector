# ZouGomaDataPlatform

A local-first analytical investigation platform. Run SQL once against BigQuery,
cache results as Parquet, explore and join datasets infinitely with DuckDB — no
repeated warehouse queries.

---

## Architecture

```
Browser (React + React Flow)
        │  REST (axios)
        ▼
FastAPI backend (Python 3.11)
  ├── DuckDB engine          ← local SQL execution over cached views
  ├── BigQuery connector     ← ADC / personal gcloud credentials
  ├── Parquet cache          ← /data/cache/node_<id>.parquet
  └── SQLite metadata store  ← /data/metadata/store.db
```

Every executed node materialises its result as a Parquet file and registers a
DuckDB VIEW named `node_<id>`. Downstream transform nodes query upstream nodes
by that view name directly in SQL.

---

## Local development (without Docker)

### Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Python | ≥ 3.11 | `brew install python` / `pyenv` |
| Node.js | ≥ 20 | `brew install node` |
| Google Cloud SDK | any | https://cloud.google.com/sdk/docs/install |

---

### Step 1 — BigQuery credentials

```bash
gcloud auth application-default login
# Follow the browser flow. Credentials saved to:
# ~/.config/gcloud/application_default_credentials.json
```

> Skip this step if you only want to test with DuckDB transforms (no BigQuery source).

---

### Step 2 — Backend

```bash
cd queryflow/backend

# Create virtual environment
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create local data directories
mkdir -p ../data/cache ../data/duckdb ../data/metadata

# Set environment variables (or create a .env file)
export DATA_DIR=../data
export CACHE_DIR=../data/cache
export DUCKDB_PATH=../data/duckdb/analytics.db
export METADATA_DB_PATH=../data/metadata/store.db

# Start the API server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Visit **http://localhost:8000/docs** to confirm the API is running.

Check BigQuery connection:
```bash
curl http://localhost:8000/api/bq/status
```

---

### Step 3 — Frontend

Open a **second terminal**:

```bash
cd queryflow/frontend

npm install
npm run dev
```

Visit **http://localhost:5173**

The Vite dev server proxies `/api/*` → `http://localhost:8000` automatically.

---

### Step 4 — Create your first node

1. Click **New Node** → choose **Source** → name it e.g. `fact_orders`
2. In the editor panel that opens on the right, enter your BigQuery project
3. Write a SQL query:
   ```sql
   SELECT order_id, customer_id, amount, created_at
   FROM `my-project.my_dataset.orders`
   WHERE DATE(created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
   LIMIT 10000
   ```
4. Click **Run** — status badge turns amber (running) → green (cached)
5. The results panel opens at the bottom showing the data

### Step 5 — Create a Transform node

1. Click **New Node** → choose **Transform** → name it `monthly_revenue`
2. Connect **fact_orders** → **monthly_revenue** by dragging the blue dot on the
   right of fact_orders to the left dot of monthly_revenue
3. In the editor, write DuckDB SQL referencing the upstream view:
   ```sql
   SELECT
     DATE_TRUNC('month', created_at::DATE)  AS month,
     COUNT(*)                               AS order_count,
     SUM(amount)                            AS total_revenue
   FROM node_<fact_orders_id>               -- shown in the "DuckDB view" badge
   GROUP BY 1
   ORDER BY 1 DESC
   ```
4. Click **Run** — executes locally in DuckDB, no BigQuery charge

---

## Docker deployment

When ready to run everything containerised:

```bash
cd queryflow

# Ensure gcloud ADC credentials exist
ls ~/.config/gcloud/application_default_credentials.json

docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |

---

## Data directory layout

```
data/
├── cache/
│   ├── node_abc123.parquet   ← one file per executed node
│   └── node_def456.parquet
├── duckdb/
│   └── analytics.db          ← DuckDB catalog (views registered here)
└── metadata/
    └── store.db              ← SQLite: nodes + edges JSON
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `403 Access Denied` on BQ query | Re-run `gcloud auth application-default login` |
| Node stays in **Running** forever | Check backend terminal for Python traceback |
| `node_xxx does not exist` in transform SQL | Run the upstream node first |
| Frontend shows blank canvas | Check `npm run dev` output; confirm backend is on :8000 |
| DuckDB views lost after restart | Re-run nodes; engine re-registers on startup from existing `.parquet` files |

