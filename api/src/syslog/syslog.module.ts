import { Module } from '@nestjs/common';
import { DailyLogFileWriter } from './daily-log-file';
import { SessionTable } from './session-table';
import { SyslogService } from './syslog.service';

@Module({
  providers: [DailyLogFileWriter, SessionTable, SyslogService],
  exports: [SessionTable],
})
export class SyslogModule {}
