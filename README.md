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

Abre <http://localhost:5183>. Verás la pantalla de inicio de sesión. Pulsa
"Créala aquí" para registrar tu familia: quedarás como administrador.

## Usuarios y contraseñas

- El administrador agrega a los demás miembros desde "Miembros". La aplicación
  muestra una contraseña temporal una sola vez; el miembro debe cambiarla al entrar.
- Si un miembro olvida su contraseña, el administrador le genera otra desde
  "Miembros".
- Si la olvida el único administrador, se restablece desde la terminal:

  ```powershell
  cd backend; .venv\Scripts\activate
  python manage.py changepassword correo@ejemplo.com
  ```

- Para tener datos de ejemplo sin cargarlos a mano:

  ```powershell
  cd backend; .venv\Scripts\activate
  python manage.py seed_demo
  ```

  Crea "Familia Demo" con `admin@demo.test`, `editor@demo.test` y
  `lector@demo.test`. La contraseña de los tres es el valor de `DEMO_PASSWORD`
  en `backend\.env`. Solo funciona en desarrollo.

- Para entrar al panel de Django (<http://localhost:8010/admin/>) hace falta un
  superusuario: `python manage.py createsuperuser`.

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
