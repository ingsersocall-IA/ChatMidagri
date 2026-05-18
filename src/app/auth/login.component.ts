import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'midagri-login',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  error = '';
  loading = false;

  submit(): void {
    this.error = '';
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.loading = true;
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl('/chat'),
      error: (err: { error?: { message?: string | string[] } }) => {
        this.loading = false;
        const m = err?.error?.message;
        this.error = Array.isArray(m)
          ? m.join('; ')
          : (m ??
            (typeof err?.error === 'string' ? err.error : null) ??
            'No se pudo iniciar sesión.');
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
