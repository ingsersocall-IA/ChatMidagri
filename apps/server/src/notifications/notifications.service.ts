import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../entities/notification.entity';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly repo: Repository<Notification>,
  ) {}

  async create(userId: string, type: NotificationType, data: Record<string, unknown>) {
    const n = this.repo.create({ userId, type, data });
    return this.repo.save(n);
  }

  async listByUser(userId: string) {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    await this.repo.update({ id, userId }, { read: true });
  }

  async markAllRead(userId: string) {
    await this.repo.update({ userId, read: false }, { read: true });
  }

  async accept(id: string, userId: string) {
    await this.repo.update({ id, userId }, { status: 'accepted', read: true });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({ where: { userId, read: false } });
  }
}
