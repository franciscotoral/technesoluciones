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

## Producción (VPS con nginx)

El frontend y el backend se sirven en el mismo dominio: nginx sirve `dist/` en `/`
y reenvía `/api/*` al backend FastAPI, que solo escucha en `127.0.0.1:8000`
(no expuesto directamente a Internet). Por eso `environment.production.ts` usa
`apiUrl: ''` (rutas relativas) — no hace falta cambiarlo.

Primer despliegue en el servidor:

```bash
cd /var/www/technesoluciones
git pull

# Frontend
npm ci
npm run build            # regenera dist/, servido por nginx

# Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env     # y rellena las claves reales (NVIDIA_API_KEY, ANTHROPIC_API_KEY, SUPABASE_*)
```

Servicio systemd (arranca el backend y lo reinicia si cae o si reinicia el servidor):

```bash
sudo cp deploy/techne-backend.service /etc/systemd/system/techne-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now techne-backend
```

nginx: añade el bloque de `deploy/nginx-api-location.conf` al `server {}` que ya
sirve `dist/`, luego `sudo nginx -t && sudo systemctl reload nginx`.

Cada vez que se despliega código nuevo (`git pull`):

```bash
npm ci && npm run build                                   # si cambió el frontend
cd backend && .venv/bin/pip install -r requirements.txt   # si cambiaron deps
sudo systemctl restart techne-backend                     # si cambió backend/ o backend/.env
```

`backend/.env` está en `.gitignore` — no viaja con `git pull`. Se crea una vez
en el servidor y se edita ahí directamente cuando cambian claves o el prompt
del asistente.
