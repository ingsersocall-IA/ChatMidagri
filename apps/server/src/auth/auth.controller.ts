import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

interface ReqUser {
  userId: string;
  email: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password, dto.name);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Get('me')
  @UseGuards(AuthGuard('jwt'))
  async me(@Req() req: { user: ReqUser }) {
    return this.auth.getProfile(req.user.userId);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'))
  async updateProfile(
    @Req() req: { user: ReqUser },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.auth.updateProfile(req.user.userId, dto);
  }

  @Patch('password')
  @UseGuards(AuthGuard('jwt'))
  async changePassword(
    @Req() req: { user: ReqUser },
    @Body() dto: ChangePasswordDto,
  ) {
    try {
      await this.auth.changePassword(
        req.user.userId,
        dto.currentPassword,
        dto.newPassword,
      );
      return { ok: true };
    } catch (e) {
      if (e instanceof Error && e.message === 'INVALID_CURRENT_PASSWORD') {
        throw new BadRequestException('La contraseña actual es incorrecta.');
      }
      throw e;
    }
  }
}
