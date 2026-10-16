# Spec 014 — Icono de la aplicación

| | |
|---|---|
| **Estado** | Implementada |
| **Depende de** | Spec 012 (despliegue) |

## 1. Objetivo

Que la pestaña del navegador y el acceso directo en el móvil muestren el
icono de Finanzas Familiares en vez del de Vite (o del genérico del
navegador).

Hoy `frontend/index.html` no declara ningún icono, así que cada navegador
pone el que quiere.

## 2. Diseño del icono

- El mismo símbolo que ya usa la marca en la cabecera y en el login: la
  cartera (`Wallet`) de Lucide.
- Cartera blanca sobre un cuadrado azul `primary` (#1e40af) con las esquinas
  redondeadas. Así se distingue en pestañas claras y oscuras.
- Sin texto: a 16 px no se leería.

## 3. Alcance

- `frontend/public/favicon.svg`: el icono para la pestaña (los navegadores
  actuales aceptan SVG; se ve nítido a cualquier tamaño).
- `frontend/public/apple-touch-icon.png` (180 × 180): el que usa el iPhone al
  "Añadir a pantalla de inicio", que no acepta SVG. Se genera a partir del
  SVG y se guarda en el repositorio.
- `frontend/public/favicon.ico` (32 × 32): para los navegadores que piden
  `/favicon.ico` sin mirar el HTML.
- `index.html`: enlaces a los tres iconos y `<meta name="theme-color">` con el
  azul `primary`, que colorea la barra del navegador en Android.

## 4. Fuera de alcance

- Manifiesto web y que la aplicación se pueda instalar (PWA).
- Cambiar el logo de la cabecera o del login.

## 5. Criterios de aceptación

1. En `localhost:5183` la pestaña muestra la cartera blanca sobre azul.
2. `GET /favicon.svg`, `/favicon.ico` y `/apple-touch-icon.png` responden 200
   en local y, tras desplegar, en Vercel.
3. `npm run build` copia los tres archivos a `dist/`.

## 6. Decisiones a revisar

- **Símbolo**: la cartera de la cabecera, para que la marca sea una sola.
- **Color**: azul `primary` de fondo (el verde se reserva para ingresos).
