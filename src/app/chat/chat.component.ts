import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import {
  ChatService,
  ConversationDto,
  FolderDto,
  MessageDto,
} from '../services/chat.service';
import { SpeechService } from '../services/speech.service';
import { MarkdownBubbleComponent } from '../shared/markdown-bubble.component';

type UiMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

type FolderDialogMode = 'create' | 'rename';

type ToastType = 'success' | 'error' | 'info';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
};

@Component({
  selector: 'midagri-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownBubbleComponent],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.scss',
})
export class ChatComponent implements OnDestroy {
  private readonly chat = inject(ChatService);
  private readonly auth = inject(AuthService);
  private readonly speech = inject(SpeechService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  private sub?: Subscription;
  @ViewChild('threadEl') threadEl?: ElementRef<HTMLDivElement>;
  @ViewChild('composerInput') composerInput?: ElementRef<HTMLTextAreaElement>;

  readonly conversations = signal<ConversationDto[]>([]);
  readonly folders = signal<FolderDto[]>([]);
  readonly messages = signal<MessageDto[]>([]);
  readonly optimisticMessages = signal<UiMessage[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly streamingText = signal('');
  readonly assistantThinking = signal(false);
  readonly sending = signal(false);
  readonly isRecording = signal(false);
  readonly ttsEnabled = signal(false);
  readonly audioPlaying = signal(false);
  readonly logoSrc = signal('/assets/branding/ministerio.png');
  readonly assistantIconSrc = signal('/assets/branding/ICON_CHATMIDAGRI.png');
  readonly draggingConvId = signal<string | null>(null);
  readonly dragOverFolderId = signal<string | 'root' | null>(null);
  readonly folderDialogOpen = signal(false);
  readonly folderDialogMode = signal<FolderDialogMode>('create');
  readonly folderDialogFolderId = signal<string | null>(null);
  readonly isDarkTheme = signal(localStorage.getItem('theme') === 'dark');
  readonly sidebarCollapsed = signal(false);
  readonly sidebarMobileOpen = signal(false);
  readonly searchQuery = signal('');
  readonly copiedMessageId = signal<string | null>(null);
  readonly showScrollDown = signal(false);
  readonly toasts = signal<Toast[]>([]);
  readonly collapsedFolders = signal<Set<string>>(new Set());
  readonly rootCollapsed = signal(false);
  readonly hoveredConvId = signal<string | null>(null);
  readonly openConvMenuId = signal<string | null>(null);
  readonly dropdownPos = signal<{ top: number; left: number } | null>(null);
  readonly hoveredNavId = signal<string | null>(null);

  private toastCounter = 0;

  draft = '';
  folderNameDraft = '';

  readonly rootConversations = computed(() =>
    this.conversations().filter((c) => !c.folderId),
  );

  readonly filteredRootConversations = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.rootConversations();
    return this.rootConversations().filter((c) =>
      c.title.toLowerCase().includes(q),
    );
  });

  readonly displayedMessages = computed<UiMessage[]>(() => {
    const fromServer: UiMessage[] = this.messages().map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
    }));
    return [...fromServer, ...this.optimisticMessages()];
  });

  readonly userQuestions = computed<UiMessage[]>(() =>
    this.displayedMessages().filter((m) => m.role === 'user'),
  );

  readonly showScrollNav = computed(() => this.userQuestions().length >= 2);

  readonly suggestionQuestions = [
    '¿Cuáles son los requisitos para registro de plaguicidas?',
    '¿Qué normativa regula los derechos de agua?',
    '¿Cómo obtengo un certificado sanitario?',
  ];

  constructor() {
    this.applyTheme();
    this.sub = this.route.paramMap.subscribe((pm) => {
      void this.onRoute(pm.get('conversationId'));
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.openConvMenuId()) this.closeConvMenu();
    if (this.sidebarMobileOpen()) this.sidebarMobileOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.openConvMenuId()) this.closeConvMenu();
  }

  /* ─── Routing / data ─── */
  private async onRoute(conversationId: string | null): Promise<void> {
    await this.refreshSidebarData();
    if (conversationId) {
      this.activeId.set(conversationId);
      try {
        const msgs = await this.chat.getMessages(conversationId);
        this.messages.set(msgs);
        this.scrollThreadToBottom();
      } catch {
        void this.router.navigateByUrl('/chat', { replaceUrl: true });
      }
    } else {
      await this.bootstrapConversation();
    }
  }

  private async bootstrapConversation(): Promise<void> {
    const list = this.conversations();
    if (list.length > 0) {
      await this.router.navigate(['/chat', list[0].id], { replaceUrl: true });
      return;
    }
    const c = await this.chat.createConversation();
    await this.router.navigate(['/chat', c.id], { replaceUrl: true });
  }

  async refreshSidebarData(): Promise<void> {
    try {
      const [list, folders] = await Promise.all([this.chat.listConversations(), this.chat.listFolders()]);
      this.conversations.set(list ?? []);
      this.folders.set(folders ?? []);
    } catch {
      this.conversations.set([]);
      this.folders.set([]);
    }
  }

  /* ─── Sidebar ─── */
  async newChat(): Promise<void> {
    const c = await this.chat.createConversation();
    this.sidebarMobileOpen.set(false);
    await this.router.navigate(['/chat', c.id]);
  }

  selectConversation(id: string): void {
    this.sidebarMobileOpen.set(false);
    this.openConvMenuId.set(null);
    void this.router.navigate(['/chat', id]);
  }

  toggleSidebar(): void {
    if (window.innerWidth <= 768) {
      this.sidebarMobileOpen.update((v) => !v);
    } else {
      this.sidebarCollapsed.update((v) => !v);
    }
  }

  closeSidebar(): void { this.sidebarMobileOpen.set(false); }
  logout(): void { this.auth.logout(); }
  clearSearch(): void { this.searchQuery.set(''); }

  /* ─── Theme ─── */
  toggleTheme(): void {
    this.isDarkTheme.update((v) => !v);
    localStorage.setItem('theme', this.isDarkTheme() ? 'dark' : 'light');
    this.applyTheme();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute('data-theme', this.isDarkTheme() ? 'dark' : 'light');
  }

  /* ─── Folders ─── */
  toggleRootCollapse(): void { this.rootCollapsed.update((v) => !v); }

  isFolderCollapsed(folderId: string): boolean { return this.collapsedFolders().has(folderId); }

  toggleFolderCollapse(folderId: string): void {
    this.collapsedFolders.update((set) => {
      const next = new Set(set);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }

  conversationsByFolder(folderId: string): ConversationDto[] {
    const q = this.searchQuery().toLowerCase().trim();
    const convs = this.conversations().filter((c) => c.folderId === folderId);
    return q ? convs.filter((c) => c.title.toLowerCase().includes(q)) : convs;
  }

  convCountForFolder(folderId: string): number {
    return this.conversations().filter((c) => c.folderId === folderId).length;
  }

  onLogoError(kind: 'logo' | 'icon'): void {
    if (kind === 'logo') this.logoSrc.set('/assets/branding/midagri-logo.svg');
    else this.assistantIconSrc.set('/assets/branding/chatmidagri-icon.svg');
  }

  /* ─── Folder dialog ─── */
  openCreateFolderDialog(): void { this.folderDialogMode.set('create'); this.folderDialogFolderId.set(null); this.folderNameDraft = ''; this.folderDialogOpen.set(true); }
  openRenameFolderDialog(folder: FolderDto): void { this.folderDialogMode.set('rename'); this.folderDialogFolderId.set(folder.id); this.folderNameDraft = folder.name; this.folderDialogOpen.set(true); }
  closeFolderDialog(): void { this.folderDialogOpen.set(false); this.folderNameDraft = ''; this.folderDialogFolderId.set(null); }

  async submitFolderDialog(): Promise<void> {
    const name = this.folderNameDraft.trim();
    if (!name) return;
    if (this.folderDialogMode() === 'create') await this.chat.createFolder(name);
    else { const fid = this.folderDialogFolderId(); if (fid) await this.chat.renameFolder(fid, name); }
    this.closeFolderDialog();
    await this.refreshSidebarData();
  }

  async deleteFolder(folder: FolderDto): Promise<void> {
    const mode = window.confirm('Aceptar: mover conversaciones a la raíz.\nCancelar: mover a otra carpeta.') ? 'moveToRoot' : 'moveToFolder';
    let moveToFolderId: string | undefined;
    if (mode === 'moveToFolder') {
      const candidates = this.folders().filter((f) => f.id !== folder.id);
      if (!candidates.length) { window.alert('No hay otra carpeta destino.'); return; }
      const idxText = window.prompt(candidates.map((f, i) => `${i + 1}. ${f.name}`).join('\n'));
      const idx = Number(idxText);
      if (!Number.isInteger(idx) || idx < 1 || idx > candidates.length) return;
      moveToFolderId = candidates[idx - 1].id;
    }
    if (!window.confirm(`¿Eliminar carpeta "${folder.name}"?`)) return;
    await this.chat.deleteFolder(folder.id, mode, moveToFolderId);
    await this.refreshSidebarData();
  }

  /* ─── Conversation actions ─── */
  toggleConvMenu(conversationId: string, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.openConvMenuId() === conversationId) {
      this.openConvMenuId.set(null);
      this.dropdownPos.set(null);
    } else {
      this.openConvMenuId.set(conversationId);
      if (event) {
        const btn = (event.currentTarget as HTMLElement);
        const rect = btn.getBoundingClientRect();
        const menuWidth = 176;
        // Align dropdown's right edge with button's right edge, clamped to viewport
        const left = Math.max(4, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 4));
        this.dropdownPos.set({ top: rect.bottom + 4, left });
      }
    }
  }

  closeConvMenu(): void {
    this.openConvMenuId.set(null);
    this.dropdownPos.set(null);
  }

  async moveConversationTo(conv: ConversationDto, folderId: string | null): Promise<void> {
    this.openConvMenuId.set(null);
    await this.chat.moveConversationToFolder(conv.id, folderId);
    await this.refreshSidebarData();
  }

  async deleteConversation(conv: ConversationDto): Promise<void> {
    this.openConvMenuId.set(null);
    if (!window.confirm(`¿Eliminar conversación "${conv.title}"?`)) return;
    try {
      await this.chat.deleteConversation(conv.id);
      this.showToast('Conversación eliminada', 'success');
      if (this.activeId() === conv.id) {
        const remaining = this.conversations().filter((c) => c.id !== conv.id);
        if (remaining.length > 0) void this.router.navigate(['/chat', remaining[0].id]);
        else { const c = await this.chat.createConversation(); void this.router.navigate(['/chat', c.id], { replaceUrl: true }); }
      }
      await this.refreshSidebarData();
    } catch { this.showToast('Error al eliminar', 'error'); }
  }

  /* ─── Drag & drop ─── */
  onConvDragStart(conversationId: string): void { this.draggingConvId.set(conversationId); }
  onConvDragEnd(): void { this.draggingConvId.set(null); this.dragOverFolderId.set(null); }
  onFolderDragOver(event: DragEvent, folderId: string | 'root'): void { event.preventDefault(); this.dragOverFolderId.set(folderId); }
  onFolderDragLeave(folderId: string | 'root'): void { if (this.dragOverFolderId() === folderId) this.dragOverFolderId.set(null); }
  async onFolderDrop(folderId: string | 'root'): Promise<void> {
    const cid = this.draggingConvId();
    if (!cid) return;
    await this.chat.moveConversationToFolder(cid, folderId === 'root' ? null : folderId);
    this.dragOverFolderId.set(null); this.draggingConvId.set(null);
    await this.refreshSidebarData();
  }

  /* ─── Send / streaming ─── */
  async send(): Promise<void> {
    const id = this.activeId();
    const text = this.draft.trim();
    if (!id || text.length < 3 || this.sending()) return;

    this.optimisticMessages.update((curr) => [...curr, { id: `tmp-user-${Date.now()}`, role: 'user', content: text }]);
    this.scrollThreadToBottom();
    this.draft = '';
    this.sending.set(true); this.streamingText.set(''); this.assistantThinking.set(true);
    this.autoResizeTextarea();
    let hasToken = false, accumulated = '';
    let ttsBuffer = '';
    if (this.ttsEnabled()) { this.speech.startTtsSession(id); }

    const ttsInterval: number | undefined = this.ttsEnabled() ? setInterval(() => {
      this.audioPlaying.set(this.speech.isAudioPlaying);
      if (!this.speech.isAudioPlaying && !this.sending()) {
        if (ttsInterval !== undefined) { clearInterval(ttsInterval); }
      }
    }, 500) : undefined;

    try {
      for await (const ev of this.chat.streamAssistantReply(id, text)) {
        if (ev.type === 'token') {
          if (!hasToken) { hasToken = true; this.assistantThinking.set(false); }
          this.streamingText.update((s) => s + ev.text);
          accumulated += ev.text;
          if (this.ttsEnabled()) {
            ttsBuffer += ev.text;
            ttsBuffer = this.flushTtsBuffer(ttsBuffer);
          }
          this.scrollThreadToBottom();
        } else if (ev.type === 'error') {
          this.assistantThinking.set(false);
          this.streamingText.set('**Error:** ' + ev.message);
          this.scrollThreadToBottom();
          break;
        }
      }
      if (this.ttsEnabled() && ttsBuffer.trim().length > 0) {
        this.speech.pushTtsChunk(ttsBuffer.trim());
      }
    } finally {
      this.streamingText.set(''); this.assistantThinking.set(false); this.sending.set(false);
      this.audioPlaying.set(this.speech.isAudioPlaying);
      if (ttsInterval) clearInterval(ttsInterval);
      await this.refreshSidebarData();
      if (this.activeId()) { const msgs = await this.chat.getMessages(this.activeId()!); this.messages.set(msgs); }
      this.optimisticMessages.set([]);
      this.scrollThreadToBottom();
    }
  }

  useSuggestion(question: string): void { this.draft = question; this.autoResizeTextarea(); void this.send(); }

  private flushTtsBuffer(buffer: string): string {
    const chunks: string[] = [];
    let lastCut = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (ch === '.' || ch === '?' || ch === '!' || ch === '\n') {
        const next = buffer[i + 1];
        if (!next || next === ' ' || next === '\n') {
          const chunk = buffer.substring(lastCut, i + 1).trim();
          if (chunk.length > 1) {
            chunks.push(chunk);
          }
          lastCut = i + 1;
        }
      }
    }
    if (lastCut > 0 && buffer.length - lastCut > 200) {
      for (let i = lastCut; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === ',' || ch === ';' || ch === ':') {
          const chunk = buffer.substring(lastCut, i + 1).trim();
          if (chunk.length > 1) {
            chunks.push(chunk);
          }
          lastCut = i + 1;
          break;
        }
      }
    }
    for (const chunk of chunks) {
      this.speech.pushTtsChunk(chunk);
    }
    return buffer.substring(lastCut);
  }

  /* ─── Toast ─── */
  copyMessage(messageId: string, content: string): void {
    navigator.clipboard.writeText(content).then(() => {
      this.copiedMessageId.set(messageId);
      this.showToast('Copiado al portapapeles', 'success');
      setTimeout(() => { if (this.copiedMessageId() === messageId) this.copiedMessageId.set(null); }, 2000);
    });
  }

  private showToast(message: string, type: ToastType): void {
    const id = ++this.toastCounter;
    this.toasts.update((t) => [...t, { id, message, type }]);
    setTimeout(() => this.toasts.update((t) => t.filter((x) => x.id !== id)), 3000);
  }

  /* ─── Voice ─── */
  toggleRecording(): void {
    if (this.speech.isRecording) {
      this.isRecording.set(false);
      this.speech.stopRecording().then(async (blob) => {
        if (!blob.size) { this.showToast('No se detectó audio. Intente de nuevo.', 'error'); return; }
        try {
          const text = await this.speech.transcribe(blob);
          if (text && text.trim().length >= 3) { this.draft = text.trim(); this.autoResizeTextarea(); this.send(); }
          else { this.showToast('No se pudo entender el audio. Repita su mensaje.', 'error'); }
        } catch { this.showToast('No se pudo entender el audio. Repita su mensaje.', 'error'); }
      });
    } else { this.isRecording.set(true); this.speech.startRecording().catch(() => this.isRecording.set(false)); }
  }

  toggleTts(): void { const on = !this.ttsEnabled(); if (!on) { this.speech.stopPlayback(); this.audioPlaying.set(false); } this.ttsEnabled.set(on); }

  /* ─── Scroll ─── */
  onThreadScroll(): void {
    const el = this.threadEl?.nativeElement;
    if (!el) return;
    this.showScrollDown.set(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
  }

  scrollToBottom(): void { const el = this.threadEl?.nativeElement; if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }

  scrollToMessage(messageId: string): void {
    const el = document.getElementById('msg-' + messageId);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.classList.add('message-row--highlight'); setTimeout(() => el.classList.remove('message-row--highlight'), 1500); }
  }

  private scrollThreadToBottom(): void { queueMicrotask(() => { const el = this.threadEl?.nativeElement; if (el) el.scrollTop = el.scrollHeight; }); }

  /* ─── Helpers ─── */
  autoResizeTextarea(): void {
    queueMicrotask(() => {
      const el = this.composerInput?.nativeElement; if (!el) return;
      el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    });
  }

  formatTime(dateStr: string): string {
    const d = new Date(dateStr), now = new Date();
    const diff = now.getTime() - d.getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return 'Ahora';
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Ayer';
    if (days < 7) return `Hace ${days}d`;
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }

  truncateQuestion(text: string, maxLen: number = 50): string {
    const clean = text.replace(/\n/g, ' ').trim();
    return clean.length <= maxLen ? clean : clean.slice(0, maxLen) + '…';
  }

  questionNumber(index: number): number { return index + 1; }

  onEnterKey(event: Event): void {
    const e = event as KeyboardEvent;
    if (e.shiftKey || e.ctrlKey || e.metaKey) return;
    if (window.innerWidth <= 768 || 'ontouchstart' in window) {
      e.preventDefault();
      void this.send();
    }
  }
}
