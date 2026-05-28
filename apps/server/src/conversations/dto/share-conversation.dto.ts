import { IsUUID } from 'class-validator';

export class ShareConversationDto {
  @IsUUID()
  userId: string;
}
