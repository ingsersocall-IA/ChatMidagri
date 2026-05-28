import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Folder } from './folder.entity';
import { Message } from './message.entity';
import { User } from './user.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id' })
  userId: string;

  @ManyToOne(() => User, (u) => u.conversations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ default: 'Nueva conversación' })
  title: string;

  @Column({ name: 'folder_id', type: 'uuid', nullable: true })
  folderId: string | null;

  @ManyToOne(() => Folder, (f) => f.conversations, {
    onDelete: 'SET NULL',
    nullable: true,
  })
  @JoinColumn({ name: 'folder_id' })
  folder: Folder | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => Message, (m) => m.conversation)
  messages: Message[];
}
