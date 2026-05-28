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
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CreateFolderDto } from './dto/create-folder.dto';
import { DeleteFolderDto } from './dto/delete-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { FoldersService } from './folders.service';

@Controller('folders')
@UseGuards(AuthGuard('jwt'))
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Get()
  list(@Req() req: { user: { userId: string } }) {
    return this.folders.listByUser(req.user.userId);
  }

  @Post()
  create(@Req() req: { user: { userId: string } }, @Body() dto: CreateFolderDto) {
    return this.folders.create(req.user.userId, dto);
  }

  @Patch(':id')
  rename(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: UpdateFolderDto,
  ) {
    return this.folders.rename(req.user.userId, id, dto);
  }

  @Delete(':id')
  delete(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: { userId: string } },
    @Body() dto: DeleteFolderDto,
  ) {
    return this.folders.delete(req.user.userId, id, dto);
  }
}
