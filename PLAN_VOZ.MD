# Plan: Voz a Texto + Texto a Voz — MIDAGRI Jurídica Web

## Objetivo

Integrar dos modelos locales al chatbot MIDAGRI:
- **Speech-to-Text (STT)**: whisper.cpp con CUDA (modelo `large-v3`)
- **Text-to-Speech (TTS)**: Microsoft VibeVoice-1.5B (HuggingFace)

Hardware objetivo: **NVIDIA RTX 5090 32 GB VRAM**

---

## Arquitectura General

```
┌─ Browser (Angular :4200) ───────────────────────────────────────────┐
│  [Mic] → MediaRecorder ──WAV──→ speech.service.ts                   │
│  [Speaker] ← Audio API ←──WAV── speech.service.ts                   │
│  Chat UI existente (SSE tokens de texto)                            │
└────────────────────┬────────────────────┬───────────────────────────┘
                     │ multipart/WAV      │ SSE (audio base64 chunks)
┌────────────────────▼────────────────────▲───────────────────────────┐
│ NestJS Backend (:3000)                                               │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ apps/server/src/speech/                                      │   │
│  │  speech.module.ts       → módulo principal                   │   │
│  │  speech.controller.ts   → POST /speech/transcribe            │   │
│  │                         → GET  /speech/synthesize/stream     │   │
│  │  stt.service.ts         → cliente HTTP whisper-server (:8089)│   │
│  │  tts.service.ts         → cliente HTTP VibeVoice TTS (:8099) │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────┬──────────────────────────────┬───────────────────────┘
               │ HTTP POST multipart/WAV      │ HTTP POST JSON {text}
┌──────────────▼──────────┐ ┌─────────────────▼──────────────────────┐
│ whisper-server (:8089)  │ │ VibeVoice TTS Server (:8099)           │
│ services/whisper-cpp/   │ │ services/vibevoice-tts/                │
│ C++ + CUDA              │ │ Python FastAPI + PyTorch CUDA          │
│ Modelo: large-v3 (3 GB) │ │ Modelo: microsoft/VibeVoice-1.5B      │
└─────────────────────────┘ └────────────────────────────────────────┘
```

---

## Flujos de Datos

### Flujo 1: Voz del usuario → Texto (STT)

```
1. Usuario presiona botón micrófono en Angular
2. MediaRecorder captura audio del micrófono (navegador)
3. Al soltar/silencio → se genera WAV blob
4. speech.service.ts → POST /api/speech/transcribe (multipart)
5. NestJS SttService → reenvía audio a whisper-server :8089
6. whisper.cpp devuelve { text: "..." }
7. NestJS responde al frontend con el texto transcrito
8. Frontend inserta texto en el textarea o envía directamente al chat
```

### Flujo 2: Respuesta del modelo → Voz (TTS streaming)

```
1. Usuario envía consulta (texto o audio transcrito)
2. Backend inicia streaming RAG (existente, SSE con tokens)
3. Backend acumula texto y, en cada pausa/frase, llama a VibeVoice TTS
4. VibeVoice genera chunk de audio WAV
5. Backend emite evento SSE adicional: { type: 'audio', data: '<base64 wav>' }
6. Frontend recibe eventos audio en el mismo stream SSE del chat
7. Frontend encola y reproduce cada chunk secuencialmente con Web Audio API
```

---

## Fase 1: whisper.cpp con CUDA (Speech-to-Text)

### 1.1 Requisitos previos
- CMake >= 3.20
- CUDA Toolkit 12.x (instalado en `C:\Program Files\NVIDIA GPU Computing Toolkit\CUDA\v12.x`)
- MSVC Build Tools (Visual Studio 2022 con "Desarrollo para escritorio con C++")
- git

### 1.2 Instalación
```powershell
cd D:\Minagri Chatbt\midagri-juridica-web
mkdir -p services
cd services

# Clonar whisper.cpp
git clone https://github.com/ggerganov/whisper.cpp.git whisper-cpp
cd whisper-cpp

# Crear build con CUDA
mkdir build; cd build
cmake .. -DGGML_CUDA=ON -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release -j

# Descargar modelo large-v3 (~3 GB)
mkdir -p models
# URL: https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
# Descargar y guardar en models/ggml-large-v3.bin
```

### 1.3 Ejecución como servidor HTTP
```powershell
.\build\bin\Release\whisper-server.exe `
  --model ..\models\ggml-large-v3.bin `
  --host 127.0.0.1 --port 8089 `
  --language auto --no-timestamps
```

### 1.4 API del servidor
- **Endpoint**: `POST http://127.0.0.1:8089/inference`
- **Content-Type**: `multipart/form-data`
- **Campo**: `file` (archivo de audio WAV 16kHz mono)
- **Respuesta**: `{ "text": "texto transcrito" }`

### 1.5 VRAM estimada
- Modelo large-v3: ~3 GB en VRAM
- GPU 5090 (32 GB): más que suficiente

---

## Fase 2: VibeVoice-1.5B TTS Server (Texto a Voz)

### 2.1 Requisitos previos
- Python 3.10+ con pip
- CUDA Toolkit 12.x (mismo que whisper.cpp)
- 8+ GB VRAM libre (modelo 1.5B en fp16 ≈ 3 GB)

### 2.2 Setup del entorno virtual
```powershell
cd D:\Minagri Chatbt\midagri-juridica-web\services
mkdir vibevoice-tts; cd vibevoice-tts

python -m venv .venv
.\.venv\Scripts\Activate.ps1 -Scope Process

# PyTorch con CUDA 12.4
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu124

# Dependencias del servidor
pip install fastapi uvicorn transformers accelerate soundfile einops
pip install python-multipart pydantic
```

### 2.3 Servidor FastAPI (`server.py`)

El servidor expone dos endpoints:
- `POST /tts` — síntesis completa (texto → WAV)
- `POST /tts/stream` — síntesis por chunks (frase → WAV chunk)

**Puerto**: `8099`

### 2.4 API del servidor

#### POST /tts
```json
{ "text": "Texto a sintetizar" }
```
Respuesta: `audio/wav` (binario)

#### POST /tts/stream
```json
{ "text": "Frase a sintetizar" }
```
Respuesta: `audio/wav` (binario, chunk individual)

### 2.5 Notas sobre VibeVoice-1.5B
- Modelo de Microsoft disponible en HuggingFace
- Requiere transformers >= 4.45
- Puede necesitar vocoder adicional para convertir a waveform
- Alternativa si VibeVoice no funciona: usar Coqui TTS o XTTS-v2

---

## Fase 3: NestJS SpeechModule (Backend)

### 3.1 Estructura de archivos nuevos

```
apps/server/src/speech/
├── speech.module.ts          # SpeechModule
├── speech.controller.ts      # Endpoints REST/SSE
├── stt.service.ts            # Cliente a whisper-server
├── tts.service.ts            # Cliente a VibeVoice TTS
└── dto/
    └── synthesize.dto.ts     # DTO para solicitudes
```

### 3.2 `stt.service.ts` — Speech-to-Text
- Cliente HTTP hacia `WHISPER_SERVER_URL` (por defecto `http://127.0.0.1:8089`)
- Método `transcribe(audioBuffer: Buffer, mimeType: string): Promise<string>`
- Envía el audio vía multipart/form-data a `/inference`
- Retorna el texto transcrito

### 3.3 `tts.service.ts` — Text-to-Speech
- Cliente HTTP hacia `TTS_SERVER_URL` (por defecto `http://127.0.0.1:8099`)
- Método `synthesize(text: string): Promise<Buffer>` — audio completo
- Método `*synthesizeStream(text: string): AsyncGenerator<Buffer>` — streaming de chunks
- Envía JSON `{ text }` a `/tts` o `/tts/stream`

### 3.4 `speech.controller.ts` — Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/api/speech/transcribe` | Recibe audio (multipart), retorna `{ text }` |
| `GET`  | `/api/speech/synthesize/stream` | Query param `text`, retorna SSE con `{ type: 'audio', data: '<base64>' }` |

### 3.5 Integración en `app.module.ts`
```typescript
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [..., SpeechModule],
})
export class AppModule {}
```

### 3.6 Variables de entorno (`.env`)
```env
WHISPER_SERVER_URL=http://127.0.0.1:8089
TTS_SERVER_URL=http://127.0.0.1:8099
```

---

## Fase 4: Frontend Angular — Componentes de Audio

### 4.1 `speech.service.ts` (nuevo)
- `startRecording()` → inicia MediaRecorder
- `stopRecording()` → detiene y devuelve `Blob` (audio/wav)
- `transcribe(audioBlob: Blob): Promise<string>` → POST a `/api/speech/transcribe`
- `streamTts(conversationId: string): AsyncGenerator` → streaming de audio TTS
- `playAudioChunk(arrayBuffer: ArrayBuffer): Promise<void>` → Web Audio API

### 4.2 Modificaciones en `chat.service.ts`
- Nuevo método `transcribeAudio(blob: Blob): Promise<{ text: string }>` 
- Nuevo método `streamTtsAudio(conversationId: string): AsyncGenerator`

### 4.3 Modificaciones en `chat.component.ts`
- Señales nuevas:
  - `isRecording: Signal<boolean>`
  - `ttsEnabled: Signal<boolean>`
  - `audioPlaying: Signal<boolean>`
- Métodos:
  - `toggleRecording()` — grabar/transcribir/enviar
  - `toggleTts()` — activar/desactivar voz de respuesta
  - Modificar `send()` para emitir audio TTS si `ttsEnabled()`

### 4.4 Modificaciones en `chat.component.html`
- Botón de micrófono junto al textarea (rojo al grabar, normal al esperar)
- Toggle "Voz 🔊" para activar/desactivar TTS
- Indicador visual de audio reproduciéndose

### 4.5 Modificaciones en `chat.component.scss`
- Estilos para botón de micrófono (pulsación, animación)
- Estilos para toggle TTS
- Estilos para indicador de audio

---

## Fase 5: Orquestación y Scripts

### 5.1 Script de arranque (`start-services.ps1`)
```powershell
# Arranca los 4 servicios:
# 1. Whisper server (STT)
# 2. VibeVoice TTS server
# 3. NestJS backend
# 4. Angular frontend
```

### 5.2 Orden de inicio recomendado
1. whisper-server (STT) — puerto 8089
2. VibeVoice TTS — puerto 8099
3. NestJS backend — puerto 3000
4. Angular frontend — puerto 4200

---

## Resumen de Viabilidad

| Componente | Complejidad | Tiempo est. | VRAM | Riesgos |
|-----------|-------------|-------------|------|---------|
| whisper.cpp build CUDA | Media | 2-4h | 3 GB | Compilación CUDA en Windows |
| VibeVoice TTS server | Media-Alta | 4-8h | 6-8 GB | API nueva, puede requerir ajustes |
| NestJS SpeechModule | Baja | 2-3h | N/A | Directo, HTTP proxy |
| Frontend audio UI | Media | 3-5h | N/A | Latencia TTS en streaming |
| Orquestación | Baja | 1-2h | N/A | Scripts PowerShell |
| **Total** | | **13-22h** | **~11 GB** | |

**Factibilidad: ALTA** — La RTX 5090 de 32 GB maneja ambos modelos simultáneamente (~11 GB) con margen.

---

## Ruta de archivos del proyecto

```
D:\Minagri Chatbt\midagri-juridica-web\
├── .env                                    # +WHISPER_SERVER_URL, +TTS_SERVER_URL
├── PLAN_VOZ.MD                             # Este documento
├── start-services.ps1                      # Script de arranque
├── services/
│   ├── whisper-cpp/                        # whisper.cpp build + modelo
│   │   ├── models/ggml-large-v3.bin
│   │   └── build/bin/Release/whisper-server.exe
│   └── vibevoice-tts/                      # Servidor Python TTS
│       ├── .venv/
│       ├── server.py
│       ├── requirements.txt
│       └── start.ps1
├── apps/
│   ├── server/src/
│   │   ├── app.module.ts                   # +SpeechModule
│   │   └── speech/                         # NUEVO
│   │       ├── speech.module.ts
│   │       ├── speech.controller.ts
│   │       ├── stt.service.ts
│   │       ├── tts.service.ts
│   │       └── dto/synthesize.dto.ts
│   └── client/src/app/
│       ├── services/
│       │   ├── chat.service.ts             # +transcribeAudio, +streamTtsAudio
│       │   └── speech.service.ts           # NUEVO
│       └── chat/
│           ├── chat.component.ts           # Modificado
│           ├── chat.component.html         # Modificado
│           └── chat.component.scss         # Modificado
└── reverse-proxy/
    └── Caddyfile                           # +rutas speech (si aplica)
```
