import { Module } from '@nestjs/common';
import { NotifyModule } from '../notify/notify.module';
import { SyslogModule } from '../syslog/syslog.module';
import { JobsService } from './jobs.service';

@Module({
  imports: [NotifyModule, SyslogModule],
  providers: [JobsService],
})
export class JobsModule {}
