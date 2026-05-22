import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

const STORAGE_KEY = 'midagri_juridica_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly tokenSignal = signal<string | null>(null);
  readonly token = computed(() => this.tokenSignal());

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      this.tokenSignal.set(stored);
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
      .post<{ access_token: string }>(this.api('/api/auth/login'), {
        email,
        password,
      })
      .pipe(
        tap((res) => {
          this.setToken(res.access_token);
        }),
      );
  }

  register(email: string, password: string) {
    return this.http
      .post<{ access_token: string }>(this.api('/api/auth/register'), {
        email,
        password,
      })
      .pipe(
        tap((res) => {
          this.setToken(res.access_token);
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.tokenSignal.set(null);
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
