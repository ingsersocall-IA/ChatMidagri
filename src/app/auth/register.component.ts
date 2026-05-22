import { Component, inject } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'midagri-register',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './login.component.scss',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.maxLength(120)]],
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
    const { name, email, password } = this.form.getRawValue();
    this.loading = true;
    this.auth.register(email, password, name || undefined).subscribe({
      next: () => void this.router.navigateByUrl('/chat'),
      error: (err: { error?: { message?: string | string[] } }) => {
        this.loading = false;
        const d = err?.error;
        const m = d?.message;
        if (Array.isArray(m)) {
          this.error = m.join(', ');
        } else {
          this.error =
            m ??
            (typeof d === 'string' ? d : null) ??
            'No se pudo registrar.';
        }
      },
      complete: () => {
        this.loading = false;
      },
    });
  }
}
