import { IsOptional, IsUUID } from 'class-validator';

export class MoveConversationFolderDto {
  @IsOptional()
  @IsUUID()
  folderId?: string | null;
}
