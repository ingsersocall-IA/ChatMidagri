"""
Supertonic-3 Text-to-Speech Server
Supertone TTS — 99M params, ONNX Runtime, CPU, soporte multi-usuario concurrente.

Endpoints:
  POST /tts         - Texto completo a audio WAV (calidad maxima)
  POST /tts/stream  - Texto a audio WAV (velocidad optimizada)
  GET  /health      - Health check
"""

import asyncio
import io
import os
import warnings
from contextlib import asynccontextmanager
from typing import Any, Dict, Optional

import numpy as np
import soundfile as sf
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

warnings.filterwarnings("ignore")

MODEL_ID = "supertonic-3"
DEFAULT_VOICE = "F3"
DEFAULT_LANG = "es"
DEFAULT_TOTAL_STEPS = 6
DEFAULT_TOTAL_STEPS_STREAM = 6
DEFAULT_SPEED = 1.05
MAX_TEXT_LENGTH = 500

# CPU: 2 threads por sintesis para no saturar con multiples usuarios concurrentes
ONNX_INTRA_THREADS = 2
ONNX_INTER_THREADS = 2
# Maximo de sintesis simultaneas (cola para el resto)
MAX_CONCURRENT_SYNTH = 3

engine: Optional[Dict[str, Any]] = None
load_error: Optional[str] = None
synthesis_semaphore: Optional[asyncio.Semaphore] = None


def load_supertonic_engine() -> None:
    global engine
    from supertonic import TTS

    tts = TTS(
        model=MODEL_ID,
        auto_download=True,
        intra_op_num_threads=ONNX_INTRA_THREADS,
        inter_op_num_threads=ONNX_INTER_THREADS,
    )

    print(f"Modelo: {tts.model_name} | Multilingual: {tts.is_multilingual}")
    print(f"ONNX threads: intra={ONNX_INTRA_THREADS}, inter={ONNX_INTER_THREADS}")
    print(f"Sample rate: {tts.sample_rate} Hz")
    print(f"Voces disponibles: {tts.voice_style_names}")

    voice_styles: Dict[str, Any] = {}
    for name in tts.voice_style_names:
        try:
            voice_styles[name] = tts.get_voice_style(name)
        except Exception as e:
            print(f"  WARNING: No se pudo cargar voz '{name}': {e}")

    engine = {
        "tts": tts,
        "voice_styles": voice_styles,
        "sample_rate": tts.sample_rate,
        "voice_names": tts.voice_style_names,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    global load_error, synthesis_semaphore
    synthesis_semaphore = asyncio.Semaphore(MAX_CONCURRENT_SYNTH)
    print(f"Cargando {MODEL_ID} | CPU {ONNX_INTRA_THREADS} threads | {MAX_CONCURRENT_SYNTH} sintesis simultaneas max")
    try:
        load_supertonic_engine()
        load_error = None
        print("Motor Supertonic cargado exitosamente.")
    except Exception as e:
        load_error = str(e)
        print(f"ERROR al cargar Supertonic: {load_error}")
    yield


app = FastAPI(title="Supertonic TTS Server", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    lang: str = DEFAULT_LANG
    total_steps: int = DEFAULT_TOTAL_STEPS
    speed: float = DEFAULT_SPEED
    max_chunk_length: Optional[int] = None


def _get_voice_style(voice: str) -> Any:
    styles = engine["voice_styles"]
    if voice not in styles:
        available = list(styles.keys())
        raise ValueError(f"Voz '{voice}' no encontrada. Disponibles: {available}")
    return styles[voice]


def generate_audio(
    text: str,
    voice: str = DEFAULT_VOICE,
    lang: str = DEFAULT_LANG,
    total_steps: int = DEFAULT_TOTAL_STEPS,
    speed: float = DEFAULT_SPEED,
    max_chunk_length: Optional[int] = None,
) -> bytes:
    if engine is None:
        detail = load_error or "error desconocido al iniciar"
        raise RuntimeError(f"Modelo Supertonic no cargado. {detail}")

    text = text.strip()
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH].rsplit(' ', 1)[0].strip()
        if not text:
            raise ValueError(f"Texto demasiado largo (max {MAX_TEXT_LENGTH} caracteres)")

    tts = engine["tts"]
    voice_style = _get_voice_style(voice)

    try:
        wav, duration = tts.synthesize(
            text,
            voice_style=voice_style,
            total_steps=total_steps,
            speed=speed,
            lang=lang,
            max_chunk_length=max_chunk_length,
        )
    except Exception as synth_err:
        if "broadcast" in str(synth_err).lower() or "RUNTIME_EXCEPTION" in str(synth_err):
            half = len(text) // 2
            if half < 10:
                raise
            first_part = text[:half].rsplit(' ', 1)[0].strip()
            second_part = text[len(first_part):].strip()
            if not first_part or not second_part:
                raise
            wav1, _ = tts.synthesize(first_part, voice_style=voice_style, total_steps=total_steps, speed=speed, lang=lang, max_chunk_length=max_chunk_length)
            wav2, _ = tts.synthesize(second_part, voice_style=voice_style, total_steps=total_steps, speed=speed, lang=lang, max_chunk_length=max_chunk_length)
            silence = int(engine["sample_rate"] * 0.3)
            wav = np.concatenate([wav1.squeeze(), np.zeros(silence), wav2.squeeze()])
        else:
            raise

    if wav is None or wav.size == 0:
        raise RuntimeError("Supertonic devolvio audio vacio.")

    sample_rate = engine["sample_rate"]
    buffer = io.BytesIO()
    sf.write(buffer, wav.squeeze(), sample_rate, format="WAV", subtype="PCM_16")
    return buffer.getvalue()


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "model_loaded": engine is not None,
        "load_error": load_error,
        "model_id": MODEL_ID,
        "voices": engine["voice_names"] if engine else [],
    }


@app.post("/tts")
async def synthesize(req: SynthesizeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vacio")

    if len(text) > MAX_TEXT_LENGTH * 2:
        raise HTTPException(status_code=400, detail=f"Texto demasiado largo (max {MAX_TEXT_LENGTH * 2} caracteres)")

    async with synthesis_semaphore:
        try:
            audio_bytes = await asyncio.to_thread(
                generate_audio,
                text,
                voice=req.voice,
                lang=req.lang,
                total_steps=req.total_steps,
                speed=req.speed,
                max_chunk_length=req.max_chunk_length,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error de sintesis: {e}")

    return Response(content=audio_bytes, media_type="audio/wav")


@app.post("/tts/stream")
async def synthesize_stream(req: SynthesizeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Texto vacio")

    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH].rsplit(' ', 1)[0].strip()

    steps = req.total_steps if req.total_steps != DEFAULT_TOTAL_STEPS else DEFAULT_TOTAL_STEPS_STREAM
    max_chunk = req.max_chunk_length if req.max_chunk_length is not None else 300

    async with synthesis_semaphore:
        try:
            audio_bytes = await asyncio.to_thread(
                generate_audio,
                text,
                voice=req.voice,
                lang=req.lang,
                total_steps=steps,
                speed=req.speed,
                max_chunk_length=max_chunk,
            )
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except RuntimeError as e:
            raise HTTPException(status_code=503, detail=str(e))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error de sintesis: {e}")

    return Response(content=audio_bytes, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8099)
