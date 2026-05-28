import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.notifications.listByUser(req.user.userId);
  }

  @Get('unread-count')
  unreadCount(@Req() req: { user: { userId: string } }) {
    return this.notifications.unreadCount(req.user.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: { userId: string } }) {
    return this.notifications.markRead(id, req.user.userId);
  }

  @Post('read-all')
  markAllRead(@Req() req: { user: { userId: string } }) {
    return this.notifications.markAllRead(req.user.userId);
  }

  @Post(':id/accept')
  accept(@Param('id', ParseUUIDPipe) id: string, @Req() req: { user: { userId: string } }) {
    return this.notifications.accept(id, req.user.userId);
  }
}
