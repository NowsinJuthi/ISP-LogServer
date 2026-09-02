import { Global, Module } from '@nestjs/common';
import { WebConfigModule } from '../company/web-config.module';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';

@Global()
@Module({
  imports: [WebConfigModule],
  controllers: [LicenseController],
  providers: [LicenseService],
  exports: [LicenseService],
})
export class LicenseModule {}
