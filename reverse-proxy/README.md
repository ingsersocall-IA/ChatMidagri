# Reverse Proxy local (sin Docker)

Este folder configura un único punto de entrada local:

- `http://localhost:8080/` -> Angular (`http://localhost:4200`)
- `http://localhost:8080/api/*` -> NestJS (`http://localhost:3000/api/*`)

## 1) Instalar Caddy en Windows

Opción recomendada:

```powershell
winget install CaddyServer.Caddy
```

Luego copia `caddy.exe` dentro de este folder `reverse-proxy/` o ajusta el script para usar la ruta global.

## 2) Levantar servicios de app

Terminal 1:

```powershell
cd "..\apps\server"
npm run start:dev
```

Terminal 2:

```powershell
cd "..\apps\client"
npm start
```

## 3) Levantar proxy local

Terminal 3:

```powershell
cd ".\reverse-proxy"
.\start-caddy.ps1
```

Abrir:

- `http://localhost:8080`

## 4) Exponer por ngrok (opcional)

```powershell
ngrok http 8080
```

Así todo sale por un solo dominio público y evita problemas de CORS/rutas API.
