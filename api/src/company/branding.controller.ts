import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { clampTcpPort } from './mikrotik-ports';
import { Public } from '../license/public.decorator';
import { LicenseService } from '../license/license.service';
import { faviconDiskPath, faviconMime, faviconPublicUrl } from './favicon-file';

@Public()
@Controller('branding')
export class BrandingController {
  constructor(
    private prisma: PrismaService,
    private license: LicenseService,
  ) {}

  @Get()
  async get() {
    const row = await this.prisma.companySetting.findFirst({
      select: {
        companyName: true,
        companyLogoDirectory: true,
        mikrotikApiPort: true,
        mikrotikWinboxPort: true,
        mikrotikFirewallPort: true,
      },
    });
    const name = row?.companyName?.trim() || 'uniqbd.com Log Server';
    return {
      companyName: name,
      faviconUrl: faviconPublicUrl(row?.companyLogoDirectory) || null,
      mikrotikApiPort: clampTcpPort(row?.mikrotikApiPort),
      mikrotikWinboxPort: clampTcpPort(row?.mikrotikWinboxPort),
      mikrotikFirewallPort: clampTcpPort(row?.mikrotikFirewallPort),
      licensed: this.license.isAllowed(),
    };
  }

  @Get('favicon')
  async favicon(@Res() res: Response) {
    const row = await this.prisma.companySetting.findFirst({
      select: { companyLogoDirectory: true },
    });
    const file = faviconDiskPath(row?.companyLogoDirectory);
    if (!file) {
      res.status(404).end();
      return;
    }
    const name = file.split(/[/\\]/).pop() || 'favicon.png';
    res.setHeader('Content-Type', faviconMime(name));
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.sendFile(file);
  }
}
