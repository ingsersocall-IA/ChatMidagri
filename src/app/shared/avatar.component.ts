import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'midagri-avatar',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="avatar" [style.background-color]="bg()" [class.avatar--small]="size()==='sm'" [class.avatar--large]="size()==='lg'" [title]="name()">{{ initial() }}</div>`,
  styleUrl: './avatar.component.scss',
})
export class AvatarComponent {
  readonly name = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  readonly initial = computed(() => {
    const n = this.name().trim();
    if (!n) return '?';
    return n.charAt(0).toUpperCase();
  });

  readonly bg = computed(() => {
    let hash = 0;
    const n = this.name();
    for (let i = 0; i < n.length; i++) {
      hash = n.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 55%, 45%)`;
  });
}
