import { Component, computed, inject, input, ViewEncapsulation, AfterViewChecked, ElementRef } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

marked.setOptions({ breaks: true, gfm: true });

@Component({
  selector: 'midagri-markdown-bubble',
  standalone: true,
  template: `<div class="bubble" [class.bubble--user]="role()==='user'" [class.bubble--assistant]="role()==='assistant'"><div class="bubble__inner markdown-body" [innerHTML]="html()"></div></div>`,
  styleUrl: './markdown-bubble.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class MarkdownBubbleComponent implements AfterViewChecked {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly el = inject(ElementRef);
  private buttonsAdded = false;

  role = input.required<'user' | 'assistant'>();
  content = input.required<string>();

  html = computed<SafeHtml>(() => {
    const raw = marked.parse(this.content() ?? '', { async: false }) as string;
    const clean = DOMPurify.sanitize(raw);
    this.buttonsAdded = false;
    return this.sanitizer.bypassSecurityTrustHtml(clean);
  });

  ngAfterViewChecked(): void {
    if (this.buttonsAdded) return;
    const preBlocks = this.el.nativeElement.querySelectorAll('.markdown-body pre');
    if (!preBlocks.length) return;
    preBlocks.forEach((pre: HTMLElement) => {
      if (pre.querySelector('.code-copy-btn')) return;
      const btn = document.createElement('button');
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copiar';
      btn.addEventListener('click', () => {
        const code = pre.querySelector('code');
        const text = code ? code.textContent ?? '' : pre.textContent ?? '';
        navigator.clipboard.writeText(text).then(() => { btn.textContent = '✓ Copiado'; setTimeout(() => { btn.textContent = 'Copiar'; }, 2000); });
      });
      pre.style.position = 'relative';
      pre.insertBefore(btn, pre.firstChild);
    });
    this.buttonsAdded = true;
  }
}
