import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conversation } from '../entities/conversation.entity';
import { Folder } from '../entities/folder.entity';
import { CreateFolderDto } from './dto/create-folder.dto';
import { DeleteFolderDto } from './dto/delete-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';

@Injectable()
export class FoldersService {
  constructor(
    @InjectRepository(Folder)
    private readonly foldersRepo: Repository<Folder>,
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
  ) {}

  listByUser(userId: string): Promise<Folder[]> {
    return this.foldersRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(userId: string, dto: CreateFolderDto): Promise<Folder> {
    const normalizedName = dto.name.trim();
    const existing = await this.foldersRepo.findOne({
      where: { userId, name: normalizedName },
    });
    if (existing) {
      throw new ConflictException('Ya existe una carpeta con ese nombre.');
    }
    const folder = this.foldersRepo.create({ userId, name: normalizedName });
    return this.foldersRepo.save(folder);
  }

  async rename(userId: string, folderId: string, dto: UpdateFolderDto): Promise<Folder> {
    const folder = await this.getOwnedFolderOrThrow(userId, folderId);
    const normalizedName = dto.name.trim();
    const existing = await this.foldersRepo.findOne({
      where: { userId, name: normalizedName },
    });
    if (existing && existing.id !== folder.id) {
      throw new ConflictException('Ya existe una carpeta con ese nombre.');
    }
    folder.name = normalizedName;
    return this.foldersRepo.save(folder);
  }

  async delete(userId: string, folderId: string, dto: DeleteFolderDto): Promise<{ deleted: true }> {
    const folder = await this.getOwnedFolderOrThrow(userId, folderId);

    if (dto.deleteMode === 'moveToRoot') {
      await this.convRepo.update({ userId, folderId: folder.id }, { folderId: null });
    } else {
      if (!dto.moveToFolderId) {
        throw new BadRequestException('Debe indicar carpeta destino.');
      }
      if (dto.moveToFolderId === folder.id) {
        throw new BadRequestException('La carpeta destino no puede ser la misma.');
      }
      await this.getOwnedFolderOrThrow(userId, dto.moveToFolderId);
      await this.convRepo.update(
        { userId, folderId: folder.id },
        { folderId: dto.moveToFolderId },
      );
    }
    await this.foldersRepo.delete({ id: folder.id, userId });
    return { deleted: true };
  }

  async getOwnedFolderOrThrow(userId: string, folderId: string): Promise<Folder> {
    const folder = await this.foldersRepo.findOne({
      where: { id: folderId, userId },
    });
    if (!folder) {
      throw new NotFoundException('Carpeta no encontrada.');
    }
    return folder;
  }
}
