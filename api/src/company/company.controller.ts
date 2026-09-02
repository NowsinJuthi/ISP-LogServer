import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';
import { assertSafeSmsUrl, assertSafeSmtpTarget, smsAllowlist } from '../security/net-guard';
import { clampTcpPort, invalidateMikrotikPortsCache } from './mikrotik-ports';
import { WebConfigService } from './web-config.service';
import { NotifyService } from '../notify/notify.service';
import { faviconPublicUrl, removeFaviconFiles, writeFavicon } from './favicon-file';

function memoryUpload() {
  return {
    _handleFile(
      _req: unknown,
      file: { stream: NodeJS.ReadableStream },
      cb: (err: Error | null, info?: { buffer: Buffer }) => void,
    ) {
      const chunks: Buffer[] = [];
      file.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      file.stream.on('error', cb);
      file.stream.on('end', () => cb(null, { buffer: Buffer.concat(chunks) }));
    },
    _removeFile(_req: unknown, _file: unknown, cb: (err: Error | null) => void) {
      cb(null);
    },
  };
}

class CompanyDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  companyName?: string;
  @IsOptional()
  @IsString()
  logServerUrl?: string;
  @IsOptional()
  @IsString()
  mobileNumber?: string;
  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactEmail?: string;
  @IsOptional()
  @IsBoolean()
  smsSendingEnable?: boolean;
  @IsOptional()
  @IsString()
  smsProviderUserId?: string;
  @IsOptional()
  @IsString()
  smsProviderSender?: string;
  @IsOptional()
  @IsString()
  smsProviderPassword?: string;
  @IsOptional()
  @IsString()
  smsProviderId?: string;
  @IsOptional()
  @IsBoolean()
  emailSendingEnable?: boolean;
  @IsOptional()
  @IsString()
  smtpHost?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort?: number;
  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;
  @IsOptional()
  @IsString()
  smtpUser?: string;
  @IsOptional()
  @IsString()
  smtpPassword?: string;
  @IsOptional()
  @IsString()
  smtpFromEmail?: string;
  @IsOptional()
  @IsString()
  smtpFromName?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  mikrotikApiPort?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  mikrotikWinboxPort?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  mikrotikFirewallPort?: number;
}

function publicCompany(row: {
  smsProviderPassword?: string | null;
  smtpPassword?: string | null;
  companyLogoDirectory?: string | null;
  [key: string]: unknown;
}) {
  const { smsProviderPassword, smtpPassword, licenseKey: _licenseKey, ...safe } = row;
  return {
    ...safe,
    faviconUrl: faviconPublicUrl(row.companyLogoDirectory) || null,
    smsPasswordSet: Boolean(smsProviderPassword),
    smtpPasswordSet: Boolean(smtpPassword),
  };
}

@Controller('company-settings')
@UseGuards(JwtAuthGuard, MenusGuard)
@RequireMenus('/company-settings')
export class CompanyController {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private webConfig: WebConfigService,
    private notify: NotifyService,
  ) {}

  @Get()
  async get() {
    const row = await this.prisma.companySetting.findFirst();
    return row ? publicCompany(row) : {};
  }

  @Put()
  @RequireWrite()
  async update(@Body() body: CompanyDto, @Req() req: { user: AuthUser }) {
    const smsId = body.smsProviderId?.trim() || '';
    if (smsId.startsWith('http')) {
      assertSafeSmsUrl(smsId, smsAllowlist());
    }
    if (body.smtpHost?.trim()) {
      await assertSafeSmtpTarget(body.smtpHost.trim(), body.smtpPort || 587);
    }
    const data = {
      companyName: body.companyName?.trim() || 'uniqbd.com Log Server',
      logServerUrl: body.logServerUrl?.trim() || null,
      mobileNumber: body.mobileNumber?.trim() || null,
      contactEmail: body.contactEmail?.trim() || null,
      smsSendingEnable: body.smsSendingEnable ?? false,
      smsProviderUserId: body.smsProviderUserId?.trim() || null,
      smsProviderSender: body.smsProviderSender?.trim() || null,
      smsProviderId: body.smsProviderId?.trim() || null,
      emailSendingEnable: body.emailSendingEnable ?? false,
      smtpHost: body.smtpHost?.trim() || null,
      smtpPort: body.smtpPort ? Number(body.smtpPort) : null,
      smtpSecure: body.smtpSecure ?? true,
      smtpUser: body.smtpUser?.trim() || null,
      smtpFromEmail: body.smtpFromEmail?.trim() || null,
      smtpFromName: body.smtpFromName?.trim() || null,
      mikrotikApiPort: clampTcpPort(body.mikrotikApiPort),
      mikrotikWinboxPort: clampTcpPort(body.mikrotikWinboxPort),
      mikrotikFirewallPort: clampTcpPort(body.mikrotikFirewallPort),
      ...(body.smsProviderPassword?.trim()
        ? { smsProviderPassword: body.smsProviderPassword.trim() }
        : {}),
      ...(body.smtpPassword?.trim() ? { smtpPassword: body.smtpPassword.trim() } : {}),
    };
    const row = await this.prisma.companySetting.findFirst();
    const saved = row
      ? await this.prisma.companySetting.update({ where: { id: row.id }, data })
      : await this.prisma.companySetting.create({ data });
    await this.webConfig.persistCurrent();
    invalidateMikrotikPortsCache();
    await this.prisma.server.updateMany({
      data: { port: String(data.mikrotikApiPort) },
    });
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Company',
      message: `Updated company settings (${data.companyName})`,
    });
    return publicCompany(saved);
  }

  @Post('test-email')
  @RequireWrite()
  testEmail(@Req() req: { user: AuthUser }) {
    return this.notify.testEmail(req.user);
  }

  @Post('test-sms')
  @RequireWrite()
  testSms(@Req() req: { user: AuthUser }) {
    return this.notify.testSms(req.user);
  }

  @Post('favicon')
  @RequireWrite()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryUpload(),
      limits: { fileSize: 200 * 1024 },
    }),
  )
  async uploadFavicon(
    @UploadedFile() file: { buffer?: Buffer; mimetype?: string } | undefined,
    @Req() req: { user: AuthUser },
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Choose a favicon image (PNG, ICO, SVG, WEBP or JPG).');
    }
    let name = '';
    try {
      name = writeFavicon(file.buffer, file.mimetype || '');
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    const row = await this.prisma.companySetting.findFirst();
    const saved = row
      ? await this.prisma.companySetting.update({
          where: { id: row.id },
          data: { companyLogoDirectory: name },
        })
      : await this.prisma.companySetting.create({
          data: { companyName: 'uniqbd.com Log Server', companyLogoDirectory: name },
        });
    await this.webConfig.persistCurrent();
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Company',
      message: 'Updated browser favicon',
    });
    return publicCompany(saved);
  }

  @Delete('favicon')
  @RequireWrite()
  async clearFavicon(@Req() req: { user: AuthUser }) {
    removeFaviconFiles();
    const row = await this.prisma.companySetting.findFirst();
    const saved = row
      ? await this.prisma.companySetting.update({
          where: { id: row.id },
          data: { companyLogoDirectory: null },
        })
      : null;
    await this.webConfig.persistCurrent();
    void this.audit.write({
      actor: req.user,
      type: 'UPDATE',
      tableName: 'Company',
      message: 'Removed browser favicon',
    });
    return saved ? publicCompany(saved) : { faviconUrl: null };
  }
}
