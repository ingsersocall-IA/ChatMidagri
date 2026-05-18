import { Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface TtsEvent {
  type: 'audio' | 'done' | 'error';
  data?: string;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private audioContext?: AudioContext;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying = false;
  private ttsTextQueue: string[] = [];
  private isProcessingTtsQueue = false;
  private currentTtsConversationId: string | null = null;

  constructor(private readonly auth: AuthService) {}

  private api(path: string): string {
    const base = environment.apiBase.replace(/\/$/, '');
    return `${base}/api${path}`;
  }

  get isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  startTtsSession(conversationId: string): void {
    this.stopPlayback();
    this.ttsTextQueue = [];
    this.isProcessingTtsQueue = false;
    this.currentTtsConversationId = conversationId;
  }

  pushTtsChunk(text: string): void {
    const cleaned = SpeechService.cleanTextForTts(text);
    if (!cleaned.trim() || !this.currentTtsConversationId) return;
    this.ttsTextQueue.push(cleaned.trim());
    if (!this.isProcessingTtsQueue) {
      void this.processTtsQueue();
    }
  }

  private async processTtsQueue(): Promise<void> {
    if (this.isProcessingTtsQueue) return;
    this.isProcessingTtsQueue = true;

    while (this.ttsTextQueue.length > 0 && this.currentTtsConversationId) {
      const text = this.ttsTextQueue.shift()!;
      const convId = this.currentTtsConversationId;
      try {
        for await (const ev of this.streamTts(text, convId)) {
          if (ev.type === 'audio' && ev.data) {
            this.enqueueAudio(ev.data);
          } else if (ev.type === 'error') {
            break;
          }
        }
      } catch {
        // Skip failed chunk, continue with next
      }
    }

    this.isProcessingTtsQueue = false;
  }

  static cleanTextForTts(text: string): string {
    return text
      .replace(/#{1,6}\s+/g, '')
      .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
      .replace(/`{1,3}[^`]+`{1,3}/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/^[-*+]\s+/gm, '')
      .replace(/^\d+\.\s+/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  /**
   * Inicia grabacion de audio desde el microfono.
   */
  async startRecording(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    this.audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm';

    this.mediaRecorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };
    this.mediaRecorder.start(100);
  }

  /**
   * Detiene grabacion y devuelve el blob de audio.
   */
  async stopRecording(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve(new Blob());
        return;
      }
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
        this.mediaRecorder?.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }

  /**
   * Envia audio al backend para transcripcion.
   */
  async transcribe(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');

    const res = await fetch(this.api('/speech/transcribe'), {
      method: 'POST',
      headers: {
        ...this.auth.authHeader(),
      },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      throw new Error(err || `Error HTTP ${res.status}`);
    }

    const data = (await res.json()) as { text: string };
    return data.text;
  }

  /**
   * Streaming TTS: recibe texto, devuelve eventos con chunks de audio.
   */
  async *streamTts(text: string, conversationId: string): AsyncGenerator<TtsEvent> {
    const params = new URLSearchParams({ text, conversationId });
    const url = `${this.api('/speech/synthesize/stream')}?${params}`;

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        ...this.auth.authHeader(),
      },
    });

    if (!res.ok || !res.body) {
      const txt = await res.text().catch(() => '');
      yield { type: 'error', message: txt || `Error HTTP ${res.status}` };
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const line = block
          .split('\n')
          .find((l) => l.startsWith('data: '));
        if (!line) continue;
        const json = line.slice(6).trim();
        if (!json) continue;
        let evt: TtsEvent;
        try {
          evt = JSON.parse(json) as TtsEvent;
        } catch {
          continue;
        }
        if (evt.type === 'audio' && evt.data) {
          yield evt;
        } else if (evt.type === 'done') {
          yield evt;
        } else if (evt.type === 'error') {
          yield evt;
          return;
        }
      }
    }
  }

  /**
   * Encola un chunk de audio base64 para reproduccion secuencial.
   */
  async enqueueAudio(base64: string): Promise<void> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    this.audioQueue.push(bytes.buffer);
    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  /**
   * Reproduce el siguiente chunk de audio en cola.
   */
  private async playNextChunk(): Promise<void> {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    this.audioContext ??= new AudioContext();

    const buffer = this.audioQueue.shift()!;
    try {
      const audioBuffer = await this.audioContext.decodeAudioData(buffer);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioContext.destination);
      source.onended = () => {
        this.playNextChunk();
      };
      source.start();
    } catch {
      this.playNextChunk();
    }
  }

  /**
   * Detiene toda reproduccion de audio.
   */
  stopPlayback(): void {
    this.audioQueue = [];
    this.isPlaying = false;
    this.audioContext?.close();
    this.audioContext = undefined;
  }

  get isAudioPlaying(): boolean {
    return this.isPlaying || this.audioQueue.length > 0;
  }
}
