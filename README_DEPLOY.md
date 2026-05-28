# Midagri Juridica - Backend + Servicios de Voz

Backend NestJS y servicios de voz (STT + TTS) para el asistente juridico MIDAGRI.

## Requisitos

- **Node.js** 20+
- **Python** 3.12+
- **PostgreSQL** 16+
- **Git LFS** (para descargar modelos whisper)
- **CMake** + compilador C++ (para whisper.cpp)
- **CUDA 12+** (opcional, para aceleracion GPU en whisper)

## Estructura

```
midagri-juridica-backend/
├── apps/server/              # NestJS API (puerto 3000)
│   ├── src/                  # Codigo fuente TypeScript
│   ├── package.json
│   └── .env                  # Variables de entorno
├── services/
│   ├── supertonic-tts/       # TTS - Supertonic-3 (puerto 8099)
│   │   ├── server.py         # FastAPI server
│   │   ├── requirements.txt
│   │   └── start.ps1         # Script de arranque
│   └── whisper/              # STT - whisper.cpp (puerto 8089)
├── README.md
└── deploy.ps1                # Script de despliegue completo
```

## Puertos

| Servicio | Puerto | Tipo |
|----------|--------|------|
| NestJS API | 3000 | Node.js |
| Whisper STT | 8089 | C++ (whisper.cpp) |
| Supertonic TTS | 8099 | Python (ONNX Runtime) |

---

## Instalacion y despliegue

### Paso 1: Clonar el repositorio

```bash
git clone https://github.com/ingsersocall-IA/midagri-juridica-backend.git
cd midagri-juridica-backend
```

### Paso 2: Configurar variables de entorno

Copiar y editar `.env` en `apps/server/`:

```env
PORT=3000
JWT_SECRET=cambiar_por_secreto_largo_y_aleatorio

# PostgreSQL
DATABASE_URL=postgresql://usuario:password@localhost:5432/midagri_juridica
DATABASE_SYNC=true

# Servicio RAG (LightRAG)
RAG_API_URL=http://localhost:9621
RAG_QUERY_MODE=mix
RAG_TOP_K=10
RAG_CHUNK_TOP_K=20
RAG_MAX_ENTITY_TOKENS=1000
RAG_MAX_RELATION_TOKENS=1000

# Servicios de voz
TTS_SERVER_URL=http://127.0.0.1:8099
WHISPER_SERVER_URL=http://127.0.0.1:8089
```

### Paso 3: Instalar y arrancar NestJS

```bash
cd apps/server
npm install
npm run build
npm run start:prod
```

### Paso 4: Instalar y arrancar Supertonic TTS

```bash
cd services/supertonic-tts
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac
pip install -r requirements.txt
python server.py
```

La primera ejecucion descarga automaticamente el modelo Supertonic-3 (~100 MB).

### Paso 5: Instalar y arrancar Whisper STT

```bash
# Clonar whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git
cd whisper.cpp

# Compilar con CUDA (opcional, mas rapido)
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release

# O compilar solo CPU
cmake -B build
cmake --build build --config Release

# Descargar modelo
cd models
# Descargar ggml-large-v3.bin desde HuggingFace:
# https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin

# Arrancar servidor
cd ..
build\bin\Release\whisper-server.exe --model models\ggml-large-v3.bin --host 127.0.0.1 --port 8089 --language auto --no-timestamps
```

### Paso 6: Verificar

```bash
# Health NestJS
curl http://localhost:3000/api/health

# Health TTS
curl http://localhost:8099/health

# Health STT (debe responder aunque sin archivo)
curl http://localhost:8089/health
```

---

## Despliegue con reverse proxy (ngrok)

Para exponer el backend a internet:

```bash
ngrok http --url=tu-dominio.ngrok.app 3000
```

El frontend (Angular) esta configurado para apuntar al mismo dominio ngrok.

---

## Servicios externos requeridos

| Servicio | Puerto | Descripcion |
|----------|--------|-------------|
| LightRAG | 9621 | API de consulta RAG (debe estar corriendo independientemente) |

---

## Notas

- Supertonic-3 usa **ONNX Runtime CPU** — no requiere GPU
- Whisper usa **whisper.cpp** — compatible con CPU y CUDA
- El backend NestJS sirve tanto la API como los archivos estaticos del frontend en produccion
