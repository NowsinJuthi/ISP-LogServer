import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';

/** Frontend /faq redirects to dashboard. Direct API access requires Service Info. */
@Controller('faq')
@UseGuards(JwtAuthGuard, MenusGuard)
@RequireMenus('/service-info')
export class FaqController {
  constructor(private prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.faq.findMany({ orderBy: { position: 'asc' } });
  }
}
