import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'midagri-client-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  styles: [],
})
export class AppComponent {
  constructor() {
    const saved = localStorage.getItem('theme');
    document.documentElement.setAttribute('data-theme', saved === 'dark' ? 'dark' : 'light');
  }
}
