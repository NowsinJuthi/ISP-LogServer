import { Module } from '@nestjs/common';
import { BrandingController } from './branding.controller';
import { CompanyController } from './company.controller';
import { WebConfigModule } from './web-config.module';
import { NotifyModule } from '../notify/notify.module';

@Module({
  imports: [WebConfigModule, NotifyModule],
  controllers: [CompanyController, BrandingController],
})
export class CompanyModule {}
