import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TtsOptions {
  voice?: string;
  lang?: string;
  speed?: number;
  total_steps?: number;
}

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly serverUrl: string;

  constructor(private readonly config: ConfigService) {
    this.serverUrl = (this.config.get<string>('TTS_SERVER_URL') ?? 'http://127.0.0.1:8099').replace(/\/$/, '');
  }

  /**
   * Sintetiza texto completo a audio WAV.
   */
  async synthesize(text: string, options?: TtsOptions): Promise<Buffer> {
    const url = `${this.serverUrl}/tts`;

    const body: Record<string, unknown> = { text };
    if (options?.voice) body.voice = options.voice;
    if (options?.lang) body.lang = options.lang;
    if (options?.speed) body.speed = options.speed;
    if (options?.total_steps) body.total_steps = options.total_steps;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`TTS server unreachable: ${e}`);
      throw new ServiceUnavailableException('Servicio de síntesis de voz no disponible.');
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.warn(`TTS HTTP ${res.status}: ${txt}`);
      throw new ServiceUnavailableException('Error al sintetizar el audio.');
    }

    const buffer = await res.arrayBuffer();
    return Buffer.from(buffer);
  }

  /**
   * Streaming TTS: envia el texto recibido directamente al servidor TTS.
   * El frontend ya divide en frases via flushTtsBuffer(), cada frase llega
   * como una llamada independiente y se sintetiza sin chunking interno.
   */
  async *synthesizeStream(text: string, options?: TtsOptions): AsyncGenerator<Buffer> {
    const url = `${this.serverUrl}/tts/stream`;

    const body: Record<string, unknown> = { text };
    if (options?.voice) body.voice = options.voice;
    if (options?.lang) body.lang = options.lang;
    if (options?.speed) body.speed = options.speed;
    if (options?.total_steps) body.total_steps = options.total_steps;

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav' },
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`TTS stream unreachable: ${e}`);
      throw new ServiceUnavailableException('Servicio de síntesis de voz no disponible.');
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.warn(`TTS stream HTTP ${res.status}: ${txt}`);
      throw new ServiceUnavailableException('Error al iniciar síntesis de audio.');
    }

    const buffer = await res.arrayBuffer();
    if (buffer.byteLength > 0) {
      yield Buffer.from(buffer);
    }
  }

  /**
   * Divide un texto en frases (por puntuación) para TTS en tiempo real.
   * Incluye comas y dos puntos como cortes secundarios.
   */
  static splitIntoSentences(text: string): string[] {
    const sentences: string[] = [];
    let lastCut = 0;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === '.' || ch === '?' || ch === '!' || ch === '\n') {
        const next = text[i + 1];
        if (!next || next === ' ' || next === '\n') {
          const chunk = text.substring(lastCut, i + 1).trim();
          if (chunk.length > 1) {
            sentences.push(chunk);
          }
          lastCut = i + 1;
        }
      }
    }
    const remainder = text.substring(lastCut).trim();
    if (remainder.length > 0) {
      sentences.push(remainder);
    }
    return sentences;
  }

  /**
   * Divide un texto en parrafos usando doble salto de linea (\\n\\n).
   */
  static splitByParagraphs(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
  }
}
