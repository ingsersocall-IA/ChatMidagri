import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { ConversationsModule } from './conversations/conversations.module';
import { Conversation } from './entities/conversation.entity';
import { Folder } from './entities/folder.entity';
import { Message } from './entities/message.entity';
import { Notification } from './entities/notification.entity';
import { SharedConversation } from './entities/shared-conversation.entity';
import { User } from './entities/user.entity';
import { EventsModule } from './events/events.module';
import { FoldersModule } from './folders/folders.module';
import { HealthController } from './health.controller';
import { NotificationsModule } from './notifications/notifications.module';
import { RagModule } from './rag/rag.module';
import { SpeechModule } from './speech/speech.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env', '../../.env'],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        url: config.get<string>('DATABASE_URL'),
        entities: [User, Folder, Conversation, Message, SharedConversation, Notification],
        synchronize: config.get<string>('DATABASE_SYNC') === 'true',
      }),
    }),
    UsersModule,
    AuthModule,
    RagModule,
    FoldersModule,
    ConversationsModule,
    SpeechModule,
    NotificationsModule,
    EventsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
