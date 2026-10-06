import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { verify } from 'jsonwebtoken';
import type { Request } from 'express';

export type AuthUser = {
  id: string;
  role: 'STUDENT' | 'HEAD' | 'DEPUTY' | 'CURATOR' | 'PARENT' | 'ADMIN';
  firstName: string;
  lastName: string;
  mustChangePass: boolean;
};
export type AuthRequest = Request & { user: AuthUser };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const token = request.cookies?.session;
    if (!token || !process.env.JWT_SECRET) throw new UnauthorizedException();
    try {
      const payload = verify(token, process.env.JWT_SECRET) as { sub: string };
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
      });
      if (!user || user.status !== 'ACTIVE') throw new UnauthorizedException();
      if (
        user.mustChangePass &&
        !['/auth/me', '/auth/logout', '/auth/password'].includes(request.path)
      ) {
        throw new UnauthorizedException('Сначала смените временный пароль');
      }
      request.user = {
        id: user.id,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePass: user.mustChangePass,
      };
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
