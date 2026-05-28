import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import FormData from 'form-data';

const execFileAsync = promisify(execFile);

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly serverUrl: string;

  constructor(private readonly config: ConfigService) {
    this.serverUrl = (this.config.get<string>('WHISPER_SERVER_URL') ?? 'http://127.0.0.1:8089').replace(/\/$/, '');
  }

  /**
   * Convierte audio (webm, opus, etc.) a WAV 16kHz mono PCM 16-bit usando ffmpeg.
   */
  private async convertToWav(input: Buffer, sourceExtension: string): Promise<Buffer> {
    const id = randomUUID();
    const inPath = join(tmpdir(), `whisper_in_${id}.${sourceExtension}`);
    const outPath = join(tmpdir(), `whisper_out_${id}.wav`);

    try {
      await writeFile(inPath, input);
      await execFileAsync('ffmpeg', [
        '-y',
        '-i', inPath,
        '-ar', '16000',
        '-ac', '1',
        '-sample_fmt', 's16',
        outPath,
      ]);

      const { readFile } = await import('node:fs/promises');
      return await readFile(outPath);
    } finally {
      unlink(inPath).catch(() => {});
      unlink(outPath).catch(() => {});
    }
  }

  /**
   * Envia audio a whisper-server y devuelve texto transcrito.
   * Convierte automaticamente de webm/opus a WAV si es necesario.
   */
  async transcribe(audioBuffer: Buffer, filename = 'audio.webm'): Promise<string> {
    // Convertir a WAV si no es ya WAV
    const isWav = filename.endsWith('.wav') || filename.endsWith('.WAV');
    const wavBuffer = isWav ? audioBuffer : await this.convertToWav(
      audioBuffer,
      filename.includes('.') ? filename.split('.').pop()! : 'webm',
    );

    const url = `${this.serverUrl}/inference`;

    const formData = new FormData();
    formData.append('file', wavBuffer, { filename: 'audio.wav', contentType: 'audio/wav' });
    formData.append('response_format', 'json');

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...formData.getHeaders(),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: new Uint8Array(formData.getBuffer()),
      });
    } catch (e) {
      this.logger.error(`Whisper server unreachable: ${e}`);
      throw new ServiceUnavailableException('Servicio de transcripción de voz no disponible.');
    }

    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      this.logger.warn(`Whisper HTTP ${res.status}: ${txt}`);
      throw new ServiceUnavailableException('Error al transcribir el audio.');
    }

    const data = (await res.json()) as Record<string, unknown>;
    const text = typeof data['text'] === 'string' ? data['text'].trim() : '';
    if (!text) {
      throw new ServiceUnavailableException('No se pudo obtener transcripción del audio.');
    }
    return text;
  }
}
