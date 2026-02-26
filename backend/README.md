# FastAPI backend (dev)

This backend is a minimal local API for the Angular admin panel.

## Run locally (Windows PowerShell)

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

API base URL expected by frontend:
- `http://localhost:8000`

Health check:
- `GET http://localhost:8000/health`

Notes:
- This version uses in-memory storage for quick integration tests.
- Data resets on server restart.
- Next step is replacing in-memory storage with Supabase/Postgres + real auth verification.
