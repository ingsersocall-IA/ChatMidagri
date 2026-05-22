import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService, UserProfile } from '../services/auth.service';

@Component({
  selector: 'midagri-profile-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile-modal.component.html',
  styleUrl: './profile-modal.component.scss',
})
export class ProfileModalComponent {
  private readonly auth = inject(AuthService);

  readonly open = signal(false);
  readonly tab = signal<'profile' | 'password'>('profile');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');

  nameDraft = '';
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  get user(): UserProfile | null {
    return this.auth.user();
  }

  openModal(): void {
    const u = this.user;
    this.nameDraft = u?.name ?? '';
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.error.set('');
    this.success.set('');
    this.tab.set('profile');
    this.open.set(true);
  }

  closeModal(): void {
    this.open.set(false);
  }

  saveProfile(): void {
    this.error.set('');
    this.success.set('');
    this.loading.set(true);

    this.auth.updateProfile({ name: this.nameDraft.trim() || undefined }).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set('Perfil actualizado.');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(err?.error?.message ?? 'Error al guardar.');
      },
    });
  }

  changePassword(): void {
    this.error.set('');
    this.success.set('');

    if (this.newPassword !== this.confirmPassword) {
      this.error.set('Las contraseñas nuevas no coinciden.');
      return;
    }
    if (this.newPassword.length < 8) {
      this.error.set('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    this.loading.set(true);
    this.auth
      .changePassword(this.currentPassword, this.newPassword)
      .subscribe({
        next: () => {
          this.loading.set(false);
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';
          this.success.set('Contraseña cambiada exitosamente.');
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err?.error?.message ?? 'Error al cambiar contraseña.');
        },
      });
  }
}
