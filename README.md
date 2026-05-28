# MIDAGRI Jurídica · ChatMidagri (Angular + NestJS + TypeORM)

Stack conversacional para consultas orientativas al área jurídica/normativa de MIDAGRI, integrado con el servicio RAG documentado en `USO DE API CHATBOT.MD` (endpoint `POST /query/stream`).

## Estructura

| Carpeta | Descripción |
|--------|---------------|
| [apps/client](apps/client) | SPA Angular (login, registro, chat con streaming SSE). |
| [apps/server](apps/server) | API NestJS, TypeORM, JWT, proxy NDJSON → SSE hacia el RAG. |

La plantilla Django [PaginaEco](../PaginaEco/PaginaEco) se usa solo como referencia de flujo; no forma parte del runtime de este stack.

## Requisitos

- Node.js 20+
- PostgreSQL (crear base, p. ej. `midagri_juridica`)
- Servicio RAG en ejecución (por defecto `http://localhost:9621`)

## Configuración

1. Copie [`.env.example`](.env.example) a `apps/server/.env` y ajuste `DATABASE_URL`, `JWT_SECRET`, `RAG_API_URL`, etc.
2. Asegúrese de que `DATABASE_SYNC=true` solo en desarrollo (crea tablas automáticamente).

## Ejecución en desarrollo

Terminal 1 — API:

```bash
cd apps/server
npm run start:dev
```

Terminal 2 — Angular (proxy a `http://localhost:3000`):

```bash
cd apps/client
npm start
```

Abra `http://localhost:4200`, registre un usuario y use el chat. El cliente envía `/api/...` al proxy definido en `apps/client/proxy.conf.json`.

## Marca e imágenes

En `apps/client/src/assets/branding/` hay SVG de ejemplo. Puede sustituirlos por `MIDAGRI_LOGO.jpg` e `ICON_CHATMIDAGRI.png` y actualizar las rutas en `login.component.html` y `chat.component.html`.

## Producción

- Desactive `DATABASE_SYNC` y use migraciones TypeORM.
- Configure `environment.apiBase` en Angular o sirva el SPA y la API bajo el mismo origen con rutas `/api`.

## Reverse proxy local (sin Docker)

Se agregó configuración de Caddy en [`reverse-proxy`](reverse-proxy):

- [`reverse-proxy/Caddyfile`](reverse-proxy/Caddyfile)
- [`reverse-proxy/start-caddy.ps1`](reverse-proxy/start-caddy.ps1)
- [`reverse-proxy/README.md`](reverse-proxy/README.md)

Con esto puedes usar un único host local:

- `http://localhost:8080/` -> frontend
- `http://localhost:8080/api/*` -> backend
