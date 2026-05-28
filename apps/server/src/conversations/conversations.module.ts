import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from '../entities/conversation.entity';
import { Folder } from '../entities/folder.entity';
import { Message } from '../entities/message.entity';
import { SharedConversation } from '../entities/shared-conversation.entity';
import { User } from '../entities/user.entity';
import { EventsModule } from '../events/events.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RagModule } from '../rag/rag.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Folder, SharedConversation, User]),
    RagModule,
    NotificationsModule,
    EventsModule,
  ],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
