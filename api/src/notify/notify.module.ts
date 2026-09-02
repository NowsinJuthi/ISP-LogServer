import { Module } from '@nestjs/common';
import { NotifyService } from './notify.service';

@Module({
  providers: [NotifyService],
  exports: [NotifyService],
})
export class NotifyModule {}
