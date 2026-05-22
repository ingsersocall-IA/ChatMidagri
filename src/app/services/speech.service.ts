import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

export interface TtsEvent {
  type: 'audio' | 'done' | 'error';
  data?: string;
  message?: string;
}

interface AudioQueueItem {
  buffer: ArrayBuffer;
  sentenceId: number;
}

@Injectable({ providedIn: 'root' })
export class SpeechService {
  private mediaRecorder?: MediaRecorder;
  private audioChunks: Blob[] = [];
  private audioContext?: AudioContext;
  private audioQueue: AudioQueueItem[] = [];
  private isPlaying = false;
  private ttsTextQueue: string[] = [];
  private ttsOriginalQueue: string[] = [];
  private isProcessingTtsQueue = false;
  private currentTtsConversationId: string | null = null;
  private activeAbortController: AbortController | null = null;
  private ttsCancelled = false;

  /** Emite el texto que se esta reproduciendo (null = nada). Sincronizado con el audio real. */
  readonly speakingText$ = new Subject<string | null>();

  private speakingTextMap = new Map<number, string>();
  private nextSentenceId = 0;
  private currentProcessingSentenceId = -1;
  private activeSpeakingSentenceId = -1;

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
    this.cancelPendingTts();
    this.ttsTextQueue = [];
    this.ttsOriginalQueue = [];
    this.isProcessingTtsQueue = false;
    this.currentTtsConversationId = conversationId;
    this.ttsCancelled = false;
    this.speakingTextMap.clear();
    this.nextSentenceId = 0;
    this.currentProcessingSentenceId = -1;
    this.activeSpeakingSentenceId = -1;
  }

  pushTtsChunk(originalText: string): void {
    if (this.ttsCancelled || !this.currentTtsConversationId) return;
    const cleaned = SpeechService.cleanTextForTts(originalText);
    if (!cleaned.trim()) return;
    this.ttsTextQueue.push(cleaned.trim());
    // Guardar texto ORIGINAL (sin limpiar markdown) para el highlight
    this.ttsOriginalQueue.push(originalText.trim());
    if (!this.isProcessingTtsQueue) {
      void this.processTtsQueue();
    }
  }

  private async processTtsQueue(): Promise<void> {
    if (this.isProcessingTtsQueue) return;
    this.isProcessingTtsQueue = true;

    while (this.ttsTextQueue.length > 0 && !this.ttsCancelled && this.currentTtsConversationId) {
      const text = this.ttsTextQueue.shift()!;
      const original = this.ttsOriginalQueue.shift() ?? text;
      const convId = this.currentTtsConversationId;

      const sentenceId = this.nextSentenceId++;
      this.speakingTextMap.set(sentenceId, original);
      this.currentProcessingSentenceId = sentenceId;

      try {
        for await (const ev of this.streamTts(text, convId)) {
          if (this.ttsCancelled) break;
          if (ev.type === 'audio' && ev.data) {
            this.enqueueAudio(ev.data, sentenceId);
          } else if (ev.type === 'error') {
            break;
          }
        }
      } catch {
        // Skip failed chunk
      }
    }

    this.isProcessingTtsQueue = false;
    this.currentProcessingSentenceId = -1;
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

  async *streamTts(text: string, conversationId: string): AsyncGenerator<TtsEvent> {
    const controller = new AbortController();
    this.activeAbortController = controller;

    try {
      const params = new URLSearchParams({ text, conversationId });
      const url = `${this.api('/speech/synthesize/stream')}?${params}`;

      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...this.auth.authHeader(),
        },
        signal: controller.signal,
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
        if (controller.signal.aborted) break;
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
    } finally {
      if (this.activeAbortController === controller) {
        this.activeAbortController = null;
      }
    }
  }

  private enqueueAudio(base64: string, sentenceId: number): void {
    if (this.ttsCancelled) return;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    this.audioQueue.push({ buffer: bytes.buffer, sentenceId });
    if (!this.isPlaying) {
      this.playNextChunk();
    }
  }

  private async playNextChunk(): Promise<void> {
    if (this.ttsCancelled || this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }
    this.isPlaying = true;
    this.audioContext ??= new AudioContext();

    const item = this.audioQueue.shift()!;

    if (item.sentenceId !== this.activeSpeakingSentenceId) {
      this.activeSpeakingSentenceId = item.sentenceId;
      const text = this.speakingTextMap.get(item.sentenceId) ?? null;
      this.speakingText$.next(text);
    }

    try {
      const audioBuffer = await this.audioContext.decodeAudioData(item.buffer);
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

  private cancelPendingTts(): void {
    this.ttsCancelled = true;
    this.ttsTextQueue = [];
    this.ttsOriginalQueue = [];
    this.activeAbortController?.abort();
    this.activeAbortController = null;
    this.activeSpeakingSentenceId = -1;
    this.speakingText$.next(null);
  }

  stopPlayback(): void {
    this.cancelPendingTts();
    this.audioQueue = [];
    this.isPlaying = false;
    this.audioContext?.close();
    this.audioContext = undefined;
  }

  get isAudioPlaying(): boolean {
    return this.isPlaying || this.audioQueue.length > 0;
  }
}
