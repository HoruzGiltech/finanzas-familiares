# Finanzas Familiares

Aplicación web para que una familia registre sus ingresos y gastos y descubra
dónde hay fugas de dinero.

- **Frontend**: React + Vite, Tailwind CSS, Motion
- **Backend**: Django + Django REST Framework
- **Base de datos**: PostgreSQL (Docker)

El proyecto se construye con specs: mira `especs/` y las reglas en `CLAUDE.md`.

## Requisitos

- Python 3.12 o superior (en Windows se invoca con `py`)
- Node.js 20 o superior
- Docker Desktop
- Git

## Puertos

| Servicio | Puerto |
|---|---|
| Frontend (React) | 5183 |
| Backend (Django) | 8010 |
| Base de datos (Postgres) | 5434 |

## Primera vez

Los comandos son para PowerShell, desde la carpeta del proyecto.

### 1. Variables de entorno

```powershell
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Abre `backend\.env` y cambia `SECRET_KEY` y `POSTGRES_PASSWORD` por valores
propios. Para generar una clave aleatoria:

```powershell
py -c "import secrets; print(secrets.token_hex(32))"
```

Los archivos `.env` nunca se suben al repositorio.

### 2. Base de datos

```powershell
docker compose up -d
```

### 3. Backend

```powershell
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8010
```

### 4. Frontend (en otra terminal)

```powershell
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5183>. Debes ver dos tarjetas en verde: "API" y
"Base de datos".

## Día a día

```powershell
docker compose up -d                      # base de datos
cd backend; .venv\Scripts\activate; python manage.py runserver 8010
cd frontend; npm run dev                  # en otra terminal
```

## Pruebas

```powershell
cd backend
.venv\Scripts\activate
python manage.py test
```

## Apagar

`Ctrl + C` en las terminales del backend y del frontend, y después:

```powershell
docker compose stop
```

Los datos de la base se conservan. `docker compose down -v` los borra.
