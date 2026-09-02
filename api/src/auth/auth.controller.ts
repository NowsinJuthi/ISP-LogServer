import { Body, Controller, Get, HttpException, Post, Req, Res, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { authCookieOptions } from '../config/env';
import { AuthUser } from './auth-user';
import { assertLoginAllowed, clearLoginFailures, loginKey, recordLoginFailure } from './login-throttle';

class LoginDto {
  @IsString()
  @MaxLength(80)
  userName: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const key = loginKey(req.ip || req.socket.remoteAddress || 'unknown', body.userName);
    try {
      assertLoginAllowed(key);
    } catch (e) {
      throw new HttpException((e as Error).message, 429);
    }
    try {
      const { token, profile } = await this.auth.login(body.userName.trim(), body.password);
      clearLoginFailures(key);
      res.cookie('access_token', token, authCookieOptions());
      return { ok: true, user: profile };
    } catch (e) {
      recordLoginFailure(key);
      throw e;
    }
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', { path: '/', httpOnly: true, sameSite: 'lax', secure: authCookieOptions().secure });
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Req() req: { user: AuthUser }) {
    return this.auth.me(req.user.id);
  }
}
