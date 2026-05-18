# ChatMidagri - Frontend

Chatbot juridico del Ministerio de Desarrollo Agrario y Riego (MIDAGRI).

Angular 19 | TypeScript | SCSS

## Requisitos previos

- **Node.js** >= 18.x
- **npm** >= 9.x
- Backend corriendo (ver repositorio del servidor)

## Instalacion y puesta en marcha

```bash
# 1. Clonar el repositorio
git clone https://github.com/ingsersocall-IA/ChatMidagri.git
cd ChatMidagri

# 2. Instalar dependencias
npm install

# 3. Configurar la URL del backend
#    Editar src/environments/environment.ts
#    - Para desarrollo local (proxy):   apiBase: ''
#    - Para produccion con ngrok:        apiBase: 'https://backchatm.ngrok.app'

# 4. Iniciar el servidor de desarrollo
npm start
```

La aplicacion estara disponible en `http://localhost:4200/`

> En modo desarrollo, las peticiones a `/api/*` se redirigen automaticamente al backend en `http://localhost:3000` gracias a `proxy.conf.json`.

## Build para produccion

```bash
npm run build
```

Los archivos generados quedan en `dist/client/`. Asegurate de que `environment.ts` tenga la URL correcta del backend antes de compilar.

## Estructura del proyecto

```
src/
├── app/
│   ├── auth/              # Login y registro
│   ├── chat/              # Componente principal del chat
│   ├── core/              # Guards e interceptors
│   ├── services/          # AuthService, ChatService, SpeechService
│   └── shared/            # Componentes compartidos (MarkdownBubble)
├── assets/                # Imagenes y branding
├── environments/          # Configuracion de entorno (apiBase)
├── index.html
├── main.ts
└── styles.scss            # Estilos globales
```

## Despliegue

1. Compilar con `npm run build`
2. Servir el contenido de `dist/client/` desde cualquier servidor estatico (Nginx, Apache, Vercel, Netlify, etc.)
3. Asegurar que el valor de `apiBase` en `environment.ts` apunte al backend accesible_publicmente

## Funcionalidades

- Chat con streaming de respuestas
- Sintesis de voz (TTS) para respuestas del asistente
- Reconocimiento de voz (STT) para consultas por audio
- Gestion de carpetas y conversaciones
- Autenticacion (login/registro)
- Diseno responsive