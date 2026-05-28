import { Injectable } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface RealTimeEvent {
  type: 'new_message' | 'notification';
  payload: Record<string, unknown>;
  userIds: string[];
}

@Injectable()
export class EventsService {
  readonly events$ = new Subject<RealTimeEvent>();
}
