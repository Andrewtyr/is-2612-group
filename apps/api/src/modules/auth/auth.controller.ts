import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Public } from '../../common/public.decorator';
import type { AuthRequest } from '../../common/auth.guard';
import type { Response } from 'express';
import { compare, hash } from 'bcryptjs';
import { sign } from 'jsonwebtoken';
import { z } from 'zod';
import { parseInput } from '../../common/input';

const loginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Post('login')
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = loginSchema.safeParse(body);
    if (!input.success)
      throw new UnauthorizedException('Неверный логин или пароль');
    const user = await this.prisma.user.findUnique({
      where: { login: input.data.login },
    });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !(await compare(input.data.password, user.passwordHash))
    ) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    const secret = process.env.JWT_SECRET;
    if (!secret || secret.length < 32)
      throw new Error('JWT_SECRET must contain at least 32 characters');
    response.cookie(
      'session',
      sign({ sub: user.id }, secret, { expiresIn: '7d' }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        mustChangePass: user.mustChangePass,
      },
    };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('session', { path: '/' });
    return { ok: true };
  }

  @Get('me')
  me(@Req() request: AuthRequest) {
    return request.user;
  }

  @Post('password')
  async changePassword(@Req() request: AuthRequest, @Body() body: unknown) {
    const input = parseInput(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(12),
      }),
      body,
    );
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.user.id },
    });
    if (!(await compare(input.currentPassword, user.passwordHash)))
      throw new UnauthorizedException();
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: await hash(input.newPassword, 12),
        mustChangePass: false,
      },
    });
    return { ok: true };
  }
}
