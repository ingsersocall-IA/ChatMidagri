import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class DeleteFolderDto {
  @IsIn(['moveToRoot', 'moveToFolder'])
  deleteMode: 'moveToRoot' | 'moveToFolder';

  @IsOptional()
  @IsUUID()
  moveToFolderId?: string;
}
