import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { User } from '../entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async create(email: string, plainPassword: string, name?: string): Promise<User> {
    const passwordHash = await bcrypt.hash(plainPassword, 10);
    const user = this.usersRepo.create({
      email: email.toLowerCase(),
      passwordHash,
      name: name || undefined,
    });
    return this.usersRepo.save(user);
  }

  async updateProfile(id: string, data: { name?: string }): Promise<User> {
    await this.usersRepo.update(id, data);
    return this.usersRepo.findOneOrFail({ where: { id } });
  }

  async changePassword(
    id: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersRepo.findOneOrFail({ where: { id } });
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error('INVALID_CURRENT_PASSWORD');
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersRepo.update(id, { passwordHash });
  }

  async validatePassword(user: User, plain: string): Promise<boolean> {
    return bcrypt.compare(plain, user.passwordHash);
  }
}
