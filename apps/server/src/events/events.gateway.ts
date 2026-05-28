import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { EventsService } from './events.service';

@Injectable()
@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server: Server;

  private userSockets = new Map<string, Set<string>>();

  constructor(
    private readonly jwt: JwtService,
    private readonly events: EventsService,
  ) {}

  onModuleInit() {
    this.events.events$.subscribe((event) => {
      for (const uid of event.userIds) {
        const sockets = this.userSockets.get(uid);
        if (sockets) {
          for (const sid of sockets) {
            this.server.to(sid).emit(event.type, event.payload);
          }
        }
      }
    });
  }

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string;
      if (!token) { client.disconnect(); return; }
      const payload = this.jwt.verify(token) as { sub: string };
      const userId = payload.sub;
      client.data.userId = userId;

      const set = this.userSockets.get(userId) ?? new Set();
      set.add(client.id);
      this.userSockets.set(userId, set);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data?.userId as string | undefined;
    if (userId) {
      const set = this.userSockets.get(userId);
      if (set) {
        set.delete(client.id);
        if (set.size === 0) this.userSockets.delete(userId);
      }
    }
  }
}
