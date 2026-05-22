import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'midagri_juridica_token';

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(null);
  readonly token = computed(() => this.tokenSignal());

  private readonly userSignal = signal<UserProfile | null>(null);
  readonly user = computed(() => this.userSignal());

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      this.tokenSignal.set(stored);
      void this.loadUser();
    }
  }

  private api(path: string): string {
    const base = environment.apiBase.replace(/\/$/, '');
    return `${base}${path}`;
  }

  isAuthenticated(): boolean {
    return !!this.tokenSignal();
  }

  login(email: string, password: string) {
    return this.http
      .post<{ access_token: string; user: UserProfile }>(
        this.api('/api/auth/login'),
        { email, password },
      )
      .pipe(
        tap((res) => {
          this.setToken(res.access_token);
          this.userSignal.set(res.user);
        }),
      );
  }

  register(email: string, password: string) {
    return this.http
      .post<{ access_token: string; user: UserProfile }>(
        this.api('/api/auth/register'),
        { email, password },
      )
      .pipe(
        tap((res) => {
          this.setToken(res.access_token);
          this.userSignal.set(res.user);
        }),
      );
  }

  private async loadUser(): Promise<void> {
    try {
      const res = await fetch(this.api('/api/auth/me'), {
        headers: this.authHeader(),
      });
      if (res.ok) {
        const u = await res.json() as UserProfile;
        this.userSignal.set(u);
      }
    } catch {
      // Si falla, no hacer nada — el user queda null
    }
  }

  updateProfile(data: { name?: string }) {
    return this.http
      .patch<UserProfile>(this.api('/api/auth/profile'), data)
      .pipe(
        tap((u) => this.userSignal.set(u)),
      );
  }

  changePassword(currentPassword: string, newPassword: string) {
    return this.http.patch(this.api('/api/auth/password'), {
      currentPassword,
      newPassword,
    });
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.tokenSignal.set(null);
    this.userSignal.set(null);
    void this.router.navigateByUrl('/login');
  }

  private setToken(t: string): void {
    localStorage.setItem(STORAGE_KEY, t);
    this.tokenSignal.set(t);
  }

  /** Para `fetch` de streaming (no pasa por HttpInterceptor). */
  authHeader(): Record<string, string> {
    const t = this.tokenSignal();
    return t ? { Authorization: `Bearer ${t}` } : {};
  }
}
