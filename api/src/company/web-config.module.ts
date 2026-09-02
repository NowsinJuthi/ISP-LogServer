import { Module } from '@nestjs/common';
import { WebConfigService } from './web-config.service';

@Module({
  providers: [WebConfigService],
  exports: [WebConfigService],
})
export class WebConfigModule {}
