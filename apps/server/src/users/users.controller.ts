import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  @Get()
  async listAll() {
    const users = await this.usersRepo.find({
      select: ['id', 'email', 'name'],
      order: { name: 'ASC' },
    });
    return users;
  }

  @Get('search')
  async search(@Query('q') q: string) {
    if (!q || q.trim().length < 2) return [];
    const term = q.trim().toLowerCase();
    const users = await this.usersRepo
      .createQueryBuilder('u')
      .select(['u.id', 'u.email', 'u.name'])
      .where('LOWER(u.email) LIKE :term', { term: `%${term}%` })
      .orWhere('LOWER(u.name) LIKE :term', { term: `%${term}%` })
      .orderBy('u.name', 'ASC')
      .take(20)
      .getMany();
    return users;
  }
}
