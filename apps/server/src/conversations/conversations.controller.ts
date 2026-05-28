import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { MoveConversationFolderDto } from './dto/move-conversation-folder.dto';
import { ShareConversationDto } from './dto/share-conversation.dto';
import { StreamMessageDto } from './dto/stream-message.dto';
import { ConversationsService } from './conversations.service';

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.conversations.listByUser(req.user.userId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }) {
    return this.conversations.create(req.user.userId);
  }

  @Patch(':id/folder')
  moveToFolder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveConversationFolderDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.moveConversationToFolder(
      id,
      req.user.userId,
      dto.folderId ?? null,
    );
  }

  @Get(':id/messages')
  messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.listMessages(id, req.user.userId);
  }

  @Delete(':id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.deleteConversation(id, req.user.userId);
  }

  @Get(':id/shared')
  listSharedUsers(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.listSharedUsers(id, req.user.userId);
  }

  @Post(':id/share')
  share(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShareConversationDto,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.share(id, req.user.userId, dto.userId);
  }

  @Delete(':id/share/:userId')
  unshare(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: { user: { userId: string } },
  ) {
    return this.conversations.unshare(id, req.user.userId, userId);
  }

  @Post(':id/messages/stream')
  async stream(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StreamMessageDto,
    @Req() req: { user: { userId: string } },
    @Res({ passthrough: false }) res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.conversations.streamAndPersist(
        id,
        req.user.userId,
        dto.content,
        (evt) => {
          res.write(`data: ${JSON.stringify(evt)}\n\n`);
        },
      );
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error interno';
      res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`);
    }
    res.end();
  }
}
