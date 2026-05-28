"""
Supertonic-3 Text-to-Speech Server
Supertone's lightning-fast ONNX TTS — 99M params, CPU-optimized, 31 languages.

Endpoints:
  POST /tts         - Full text to WAV audio
  POST /tts/stream  - Text chunk to WAV audio (used for sentence-by-sentence streaming)
  GET  /health      - Health check
"""

import io
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
DEFAULT_VOICE = "M3"
DEFAULT_LANG = "es"
DEFAULT_TOTAL_STEPS = 5
DEFAULT_SPEED = 1.0

engine: Optional[Dict[str, Any]] = None
load_error: Optional[str] = None


def load_supertonic_engine() -> None:
    global engine
    from supertonic import TTS

    tts = TTS(model=MODEL_ID, auto_download=True)

    print(f"Model: {tts.model_name} (multilingual: {tts.is_multilingual})")
    print(f"Sample rate: {tts.sample_rate} Hz")
    print(f"Available voices: {tts.voice_style_names}")

    voice_styles: Dict[str, Any] = {}
    for name in tts.voice_style_names:
        try:
            voice_styles[name] = tts.get_voice_style(name)
        except Exception as e:
            print(f"  WARNING: Could not load voice '{name}': {e}")

    engine = {
        "tts": tts,
        "voice_styles": voice_styles,
        "sample_rate": tts.sample_rate,
        "voice_names": tts.voice_style_names,
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    global load_error
    print(f"Loading {MODEL_ID} (ONNX Runtime, CPU-optimized)...")
    try:
        load_supertonic_engine()
        load_error = None
        print("Supertonic engine loaded successfully.")
    except Exception as e:
        load_error = str(e)
        print(f"ERROR loading Supertonic engine: {load_error}")
    yield


app = FastAPI(title="Supertonic TTS Server", lifespan=lifespan)


class SynthesizeRequest(BaseModel):
    text: str
    voice: str = DEFAULT_VOICE
    lang: str = DEFAULT_LANG
    total_steps: int = DEFAULT_TOTAL_STEPS
    speed: float = DEFAULT_SPEED


def _get_voice_style(voice: str) -> Any:
    styles = engine["voice_styles"]
    if voice not in styles:
        available = list(styles.keys())
        raise ValueError(f"Voice '{voice}' not found. Available: {available}")
    return styles[voice]


def generate_audio(
    text: str,
    voice: str = DEFAULT_VOICE,
    lang: str = DEFAULT_LANG,
    total_steps: int = DEFAULT_TOTAL_STEPS,
    speed: float = DEFAULT_SPEED,
) -> bytes:
    if engine is None:
        detail = load_error or "unknown startup error"
        raise RuntimeError(f"Supertonic model not loaded. {detail}")

    tts = engine["tts"]
    voice_style = _get_voice_style(voice)

    wav, duration = tts.synthesize(
        text,
        voice_style=voice_style,
        total_steps=total_steps,
        speed=speed,
        lang=lang,
    )

    if wav is None or wav.size == 0:
        raise RuntimeError("Supertonic returned empty audio.")

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
        raise HTTPException(status_code=400, detail="Text is empty")

    try:
        audio_bytes = generate_audio(
            text,
            voice=req.voice,
            lang=req.lang,
            total_steps=req.total_steps,
            speed=req.speed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {e}")

    return Response(content=audio_bytes, media_type="audio/wav")


@app.post("/tts/stream")
async def synthesize_stream(req: SynthesizeRequest):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is empty")

    try:
        audio_bytes = generate_audio(
            text,
            voice=req.voice,
            lang=req.lang,
            total_steps=req.total_steps,
            speed=req.speed,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {e}")

    return Response(content=audio_bytes, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8099)
