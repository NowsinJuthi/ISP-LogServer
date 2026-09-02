import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { RolesModule } from './roles/roles.module';
import { MenusModule } from './menus/menus.module';
import { ServersModule } from './servers/servers.module';
import { LogsModule } from './logs/logs.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CompanyModule } from './company/company.module';
import { ServiceInfoModule } from './service-info/service-info.module';
import { AuditModule } from './audit/audit.module';
import { FaqModule } from './faq/faq.module';
import { SyslogModule } from './syslog/syslog.module';
import { JobsModule } from './jobs/jobs.module';
import { LicenseModule } from './license/license.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    ScheduleModule.forRoot(),
    PrismaModule,
    CompanyModule,
    LicenseModule,
    AuditModule,
    AuthModule,
    UsersModule,
    RolesModule,
    MenusModule,
    ServersModule,
    LogsModule,
    DashboardModule,
    ServiceInfoModule,
    FaqModule,
    SyslogModule,
    JobsModule,
  ],
})
export class AppModule {}
