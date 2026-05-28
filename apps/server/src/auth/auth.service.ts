import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async register(email: string, password: string, name?: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) {
      throw new ConflictException('El correo ya está registrado.');
    }
    const user = await this.users.create(email, password, name);
    return this.issueTokens(user.id, user.email, user.name);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await this.users.validatePassword(user, password))) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }
    return this.issueTokens(user.id, user.email, user.name);
  }

  async getProfile(userId: string) {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.users.updateProfile(userId, dto);
    return { id: user.id, email: user.email, name: user.name };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ) {
    await this.users.changePassword(userId, currentPassword, newPassword);
  }

  private issueTokens(userId: string, email: string, name?: string) {
    const payload: JwtPayload = { sub: userId, email };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: userId, email, name: name ?? null },
    };
  }
}
