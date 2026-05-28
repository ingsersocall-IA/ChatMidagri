import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { Folder } from '../entities/folder.entity';
import { Message } from '../entities/message.entity';
import { SharedConversation } from '../entities/shared-conversation.entity';
import { User } from '../entities/user.entity';
import { RagService } from '../rag/rag.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsService } from '../events/events.service';

@Injectable()
export class ConversationsService {
  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(Folder)
    private readonly folderRepo: Repository<Folder>,
    @InjectRepository(SharedConversation)
    private readonly shareRepo: Repository<SharedConversation>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly rag: RagService,
    private readonly notifications: NotificationsService,
    private readonly events: EventsService,
  ) {}

  async listByUser(userId: string) {
    const owned = await this.convRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
    const shared = await this.shareRepo.find({
      where: { userId },
      relations: ['conversation'],
      order: { createdAt: 'DESC' },
    });
    const sharedIds = new Set(shared.map((s) => s.conversationId));
    return [
      ...owned.map((c) => ({
        id: c.id, title: c.title, folderId: c.folderId,
        createdAt: c.createdAt, userId: c.userId,
        isShared: sharedIds.has(c.id),
      })),
      ...shared.map((s) => ({
        id: s.conversation.id, title: s.conversation.title,
        folderId: null as string | null,
        createdAt: s.conversation.createdAt, userId: s.conversation.userId,
        isShared: true, isParticipant: true,
      })),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async create(userId: string): Promise<Conversation> {
    const c = this.convRepo.create({ userId, title: 'Nueva conversación', folderId: null });
    return this.convRepo.save(c);
  }

  /** Verifica que el usuario sea dueño O tenga el chat compartido. */
  async getAccessibleOrThrow(id: string, userId: string): Promise<Conversation> {
    const c = await this.convRepo.findOne({ where: { id, userId } });
    if (c) return c;
    const share = await this.shareRepo.findOne({ where: { conversationId: id, userId } });
    if (share) return this.convRepo.findOneOrFail({ where: { id } });
    throw new NotFoundException('Conversación no encontrada.');
  }

  async moveConversationToFolder(
    conversationId: string, userId: string, folderId: string | null,
  ): Promise<Conversation> {
    const c = await this.convRepo.findOne({ where: { id: conversationId, userId } });
    if (!c) throw new NotFoundException('Conversación no encontrada.');
    if (folderId) {
      const f = await this.folderRepo.findOne({ where: { id: folderId, userId } });
      if (!f) throw new NotFoundException('Carpeta destino no encontrada.');
    }
    c.folderId = folderId;
    return this.convRepo.save(c);
  }

  async listMessages(conversationId: string, userId: string) {
    await this.getAccessibleOrThrow(conversationId, userId);
    const msgs = await this.msgRepo.find({
      where: { conversationId },
      relations: ['user'],
      order: { createdAt: 'ASC' },
    });
    return msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
      user: m.user ? { id: m.user.id, email: m.user.email, name: m.user.name } : null,
    }));
  }

  async deleteConversation(conversationId: string, userId: string) {
    const owned = await this.convRepo.findOne({ where: { id: conversationId, userId } });
    if (owned) {
      await this.msgRepo.delete({ conversationId: owned.id });
      await this.convRepo.remove(owned);
      return { deleted: true };
    }
    const share = await this.shareRepo.findOne({ where: { conversationId, userId } });
    if (share) {
      await this.shareRepo.remove(share);
      return { deleted: true };
    }
    throw new NotFoundException('Conversación no encontrada.');
  }

  /** Compartir conversación con otro usuario. */
  async share(conversationId: string, ownerId: string, targetUserId: string) {
    const conv = await this.convRepo.findOneOrFail({ where: { id: conversationId, userId: ownerId } });

    const existing = await this.shareRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });
    if (existing) throw new ConflictException('El chat ya fue compartido con este usuario.');

    const share = this.shareRepo.create({ conversationId, userId: targetUserId, sharedBy: ownerId });
    const saved = await this.shareRepo.save(share);

    const owner = await this.userRepo.findOneOrFail({ where: { id: ownerId } });
    await this.notifications.create(targetUserId, 'chat_shared', {
      conversationId,
      conversationTitle: conv.title,
      sharedByName: owner.name ?? owner.email,
      sharedByEmail: owner.email,
    });

    this.events.events$.next({
      type: 'notification',
      payload: { kind: 'chat_shared', conversationId, conversationTitle: conv.title },
      userIds: [targetUserId],
    });

    this.events.events$.next({
      type: 'notification',
      payload: { kind: 'sidebar_refresh' },
      userIds: [ownerId],
    });

    return saved;
  }

  /** Quitar acceso compartido. */
  async unshare(conversationId: string, ownerId: string, targetUserId: string) {
    await this.convRepo.findOneOrFail({ where: { id: conversationId, userId: ownerId } });
    const share = await this.shareRepo.findOne({
      where: { conversationId, userId: targetUserId },
    });
    if (!share) throw new NotFoundException('Usuario no encontrado en el chat compartido.');
    await this.shareRepo.remove(share);
    return { deleted: true };
  }

  /** Listar usuarios con quienes se compartió la conversación. */
  async listSharedUsers(conversationId: string, ownerId: string) {
    await this.convRepo.findOneOrFail({ where: { id: conversationId, userId: ownerId } });
    const shares = await this.shareRepo.find({
      where: { conversationId },
      relations: ['user'],
    });
    return shares.map((s) => ({
      id: s.user.id,
      email: s.user.email,
      name: s.user.name,
      sharedAt: s.createdAt,
    }));
  }

  async streamAndPersist(
    conversationId: string, userId: string, content: string,
    emit: (evt: Record<string, unknown>) => void,
  ): Promise<void> {
    const conv = await this.getAccessibleOrThrow(conversationId, userId);

    const userMsg = this.msgRepo.create({
      conversationId,
      role: 'user',
      content,
      userId,
    });
    await this.msgRepo.save(userMsg);

    const allOrdered = await this.msgRepo.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });

    const history = allOrdered.slice(0, -1).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    if (conv.title === 'Nueva conversación') {
      conv.title = content.slice(0, 80);
      await this.convRepo.save(conv);
    }

    let fullText = '';
    try {
      const result = await this.rag.streamCompletion(content, history, (chunk) => {
        emit({ type: 'token', text: chunk });
      });
      fullText = result.fullText;
    } catch (e) {
      const msg = e instanceof ServiceUnavailableException
        ? (e.getResponse() as { message?: string }).message ?? e.message
        : e instanceof Error ? e.message : 'Error desconocido';
      emit({ type: 'error', message: String(msg) });
      fullText = `[Error] ${String(msg)}`;
    }

    const assistant = this.msgRepo.create({
      conversationId,
      role: 'assistant',
      content: fullText.trim() || '(Sin respuesta del modelo)',
    });
    await this.msgRepo.save(assistant);

    const sender = await this.userRepo.findOne({ where: { id: userId }, select: ['id', 'email', 'name'] });
    const newMessages = [
      {
        id: userMsg.id, role: 'user' as const, content: userMsg.content,
        createdAt: userMsg.createdAt, user: sender ? { id: sender.id, email: sender.email, name: sender.name } : null,
      },
      {
        id: assistant.id, role: 'assistant' as const, content: assistant.content,
        createdAt: assistant.createdAt, user: null,
      },
    ];
    const participantIds = await this.getParticipantIds(conversationId);
    this.events.events$.next({
      type: 'new_message',
      payload: { conversationId, messages: newMessages },
      userIds: participantIds.filter((id) => id !== userId),
    });
  }

  private async getParticipantIds(conversationId: string): Promise<string[]> {
    const conv = await this.convRepo.findOneOrFail({ where: { id: conversationId } });
    const shares = await this.shareRepo.find({ where: { conversationId }, select: ['userId'] });
    return [conv.userId, ...shares.map((s) => s.userId)];
  }
}
