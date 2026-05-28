import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type RagHistoryItem = { role: string; content: string };

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(private readonly config: ConfigService) {}

  private baseUrl(): string {
    const u = this.config.get<string>('RAG_API_URL') ?? 'http://localhost:9621';
    return u.replace(/\/$/, '');
  }

  /**
   * Llama POST /query/stream y emite fragmentos de texto del asistente.
   * Acumula la respuesta completa para persistencia.
   */
  async streamCompletion(
    query: string,
    conversationHistory: RagHistoryItem[],
    onToken: (chunk: string) => void,
  ): Promise<{ fullText: string; references?: unknown }> {
    const url = `${this.baseUrl()}/query/stream`;
    const mode = this.config.get<string>('RAG_QUERY_MODE') ?? 'mix';
    const apiKey = this.config.get<string>('RAG_API_KEY');
    const apiHeader = this.config.get<string>('RAG_API_HEADER') ?? 'X-API-Key';
    const topK = parseInt(this.config.get<string>('RAG_TOP_K') ?? '10', 10);
    const chunkTopK = parseInt(this.config.get<string>('RAG_CHUNK_TOP_K') ?? '20', 10);
    const maxEntityTokens = parseInt(this.config.get<string>('RAG_MAX_ENTITY_TOKENS') ?? '1000', 10);
    const maxRelationTokens = parseInt(this.config.get<string>('RAG_MAX_RELATION_TOKENS') ?? '1000', 10);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/x-ndjson, application/json',
    };
    if (apiKey) {
      headers[apiHeader] = apiKey;
    }

    const body = {
      query,
      mode,
      stream: true,
      top_k: topK,
      chunk_top_k: chunkTopK,
      max_entity_tokens: maxEntityTokens,
      max_relation_tokens: maxRelationTokens,
      include_references: true,
      conversation_history: conversationHistory,
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
    } catch (e) {
      this.logger.error(`RAG fetch failed: ${e}`);
      throw new ServiceUnavailableException(
        'No se pudo conectar con el servicio de consultas.',
      );
    }

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      this.logger.warn(`RAG HTTP ${res.status}: ${t}`);
      throw new ServiceUnavailableException(
        'El servicio de consultas respondió con error.',
      );
    }

    let fullText = '';
    let references: unknown | undefined;
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let obj: Record<string, unknown>;
        try {
          obj = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          continue;
        }
        if ('error' in obj && typeof obj.error === 'string') {
          throw new ServiceUnavailableException(obj.error);
        }
        if ('references' in obj) {
          references = obj.references;
        }
        if ('response' in obj && typeof obj.response === 'string') {
          const piece = obj.response;
          fullText += piece;
          onToken(piece);
        }
      }
    }

    const tail = buffer.trim();
    if (tail) {
      try {
        const obj = JSON.parse(tail) as Record<string, unknown>;
        if ('error' in obj && typeof obj.error === 'string') {
          throw new ServiceUnavailableException(obj.error);
        }
        if ('response' in obj && typeof obj.response === 'string') {
          fullText += obj.response;
          onToken(obj.response);
        }
      } catch (e) {
        if (e instanceof ServiceUnavailableException) throw e;
      }
    }

    return { fullText, references };
  }
}
