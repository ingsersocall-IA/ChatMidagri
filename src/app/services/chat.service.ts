import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface ConversationDto {
  id: string;
  title: string;
  folderId: string | null;
  createdAt: string;
  userId?: string;
}

export interface FolderDto {
  id: string;
  name: string;
  createdAt: string;
}

export interface MessageSender {
  id: string;
  email: string;
  name: string | null;
}

export interface MessageDto {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  user: MessageSender | null;
}

export interface SharedUserDto {
  id: string;
  email: string;
  name: string | null;
  sharedAt: string;
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  constructor(
    private readonly http: HttpClient,
    private readonly auth: AuthService,
  ) {}

  private api(path: string): string {
    const base = environment.apiBase.replace(/\/$/, '');
    return `${base}${path}`;
  }

  listConversations(): Promise<ConversationDto[]> {
    return firstValueFrom(
      this.http.get<ConversationDto[]>(this.api('/api/conversations')),
    );
  }

  createConversation(): Promise<ConversationDto> {
    return firstValueFrom(
      this.http.post<ConversationDto>(this.api('/api/conversations'), {}),
    );
  }

  moveConversationToFolder(
    conversationId: string,
    folderId: string | null,
  ): Promise<ConversationDto> {
    return firstValueFrom(
      this.http.patch<ConversationDto>(
        this.api(`/api/conversations/${conversationId}/folder`),
        { folderId },
      ),
    );
  }

  deleteConversation(conversationId: string): Promise<{ deleted: true }> {
    return firstValueFrom(
      this.http.delete<{ deleted: true }>(this.api(`/api/conversations/${conversationId}`)),
    );
  }

  listFolders(): Promise<FolderDto[]> {
    return firstValueFrom(this.http.get<FolderDto[]>(this.api('/api/folders')));
  }

  createFolder(name: string): Promise<FolderDto> {
    return firstValueFrom(this.http.post<FolderDto>(this.api('/api/folders'), { name }));
  }

  renameFolder(folderId: string, name: string): Promise<FolderDto> {
    return firstValueFrom(
      this.http.patch<FolderDto>(this.api(`/api/folders/${folderId}`), { name }),
    );
  }

  deleteFolder(
    folderId: string,
    deleteMode: 'moveToRoot' | 'moveToFolder',
    moveToFolderId?: string,
  ): Promise<{ deleted: true }> {
    return firstValueFrom(
      this.http.delete<{ deleted: true }>(this.api(`/api/folders/${folderId}`), {
        body: { deleteMode, moveToFolderId },
      }),
    );
  }

  getMessages(conversationId: string): Promise<MessageDto[]> {
    return firstValueFrom(
      this.http.get<MessageDto[]>(
        this.api(`/api/conversations/${conversationId}/messages`),
      ),
    );
  }

  /**
   * POST stream SSE: emite objetos { type: 'token', text } | { type: 'done' } | { type: 'error', message }.
   */
  async *streamAssistantReply(
    conversationId: string,
    content: string,
  ): AsyncGenerator<
    | { type: 'token'; text: string }
    | { type: 'done' }
    | { type: 'error'; message: string }
  > {
    const res = await fetch(
      this.api(`/api/conversations/${conversationId}/messages/stream`),
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
          ...this.auth.authHeader(),
        },
        body: JSON.stringify({ content }),
      },
    );

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => '');
      yield {
        type: 'error',
        message: t || `Error HTTP ${res.status}`,
      };
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
        let data: Record<string, unknown>;
        try {
          data = JSON.parse(json) as Record<string, unknown>;
        } catch {
          continue;
        }
        if (data['type'] === 'token' && typeof data['text'] === 'string') {
          yield { type: 'token', text: data['text'] };
        } else if (data['type'] === 'done') {
          yield { type: 'done' };
        } else if (data['type'] === 'error') {
          yield {
            type: 'error',
            message: String(data['message'] ?? 'Error en el servicio'),
          };
        }
      }
    }
  }

  /* ─── Share ─── */

  getSharedUsers(conversationId: string) {
    return this.http.get<SharedUserDto[]>(
      this.api(`/api/conversations/${conversationId}/shared`),
    );
  }

  shareConversation(conversationId: string, userId: string) {
    return this.http.post(this.api(`/api/conversations/${conversationId}/share`), { userId });
  }

  unshareConversation(conversationId: string, userId: string) {
    return this.http.delete(this.api(`/api/conversations/${conversationId}/share/${userId}`));
  }
}
