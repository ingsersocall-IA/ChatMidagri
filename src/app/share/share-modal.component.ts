import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ChatService, SharedUserDto } from '../services/chat.service';
import { AvatarComponent } from '../shared/avatar.component';

interface UserResult {
  id: string;
  email: string;
  name: string | null;
}

@Component({
  selector: 'midagri-share-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AvatarComponent],
  templateUrl: './share-modal.component.html',
  styleUrl: './share-modal.component.scss',
})
export class ShareModalComponent {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly chat = inject(ChatService);

  readonly open = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');
  private conversationId: string | null = null;

  searchQuery = '';
  allUsers: UserResult[] = [];
  filteredUsers: UserResult[] = [];
  sharedUsers: SharedUserDto[] = [];

  openModal(conversationId: string): void {
    this.conversationId = conversationId;
    this.searchQuery = '';
    this.error.set('');
    this.loading.set(true);
    this.open.set(true);
    Promise.all([
      this.loadAllUsers(),
      this.loadSharedUsers(conversationId),
    ]).finally(() => this.loading.set(false));
  }

  closeModal(): void {
    this.open.set(false);
    this.conversationId = null;
  }

  private async loadAllUsers(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<UserResult[]>(this.api('/api/users')),
      );
      this.allUsers = res.filter((u) => u.id !== this.auth.user()?.id);
      this.applyFilter();
    } catch {
      this.allUsers = [];
    }
  }

  private async loadSharedUsers(conversationId: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.chat.getSharedUsers(conversationId),
      );
      this.sharedUsers = res;
    } catch {
      this.sharedUsers = [];
    }
  }

  applyFilter(): void {
    const q = this.searchQuery.toLowerCase().trim();
    if (!q) {
      this.filteredUsers = this.allUsers.filter(
        (u) => !this.sharedUsers.some((s) => s.id === u.id),
      );
      return;
    }
    this.filteredUsers = this.allUsers.filter(
      (u) =>
        !this.sharedUsers.some((s) => s.id === u.id) &&
        (u.email.toLowerCase().includes(q) ||
          (u.name ?? '').toLowerCase().includes(q)),
    );
  }

  share(userId: string): void {
    if (!this.conversationId) return;
    this.error.set('');
    this.chat.shareConversation(this.conversationId, userId).subscribe({
      next: async () => {
        await this.loadSharedUsers(this.conversationId!);
        this.applyFilter();
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Error al compartir.');
      },
    });
  }

  unshare(userId: string): void {
    if (!this.conversationId) return;
    this.error.set('');
    this.chat.unshareConversation(this.conversationId, userId).subscribe({
      next: async () => {
        await this.loadSharedUsers(this.conversationId!);
        this.applyFilter();
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'Error al quitar acceso.');
      },
    });
  }

  displayName(user: { name: string | null; email: string }): string {
    return user.name ?? user.email;
  }

  private api(path: string): string {
    return environment.apiBase.replace(/\/$/, '') + path;
  }
}
