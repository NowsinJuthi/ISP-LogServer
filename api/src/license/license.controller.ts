import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { LicenseService } from './license.service';

class ActivateLicenseDto {
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  licenseKey: string;
}

@Controller('license')
@UseGuards(JwtAuthGuard, MenusGuard)
export class LicenseController {
  constructor(private license: LicenseService) {}

  @Get('status')
  status() {
    return this.license.status();
  }

  @Post('activate')
  @RequireMenus('/license')
  @RequireWrite()
  activate(@Body() body: ActivateLicenseDto) {
    return this.license.activateKey(body.licenseKey);
  }

  @Post('deactivate')
  @RequireMenus('/license')
  @RequireWrite()
  deactivate() {
    return this.license.deactivate();
  }
}
