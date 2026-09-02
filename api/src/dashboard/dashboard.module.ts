import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { HostMetricsService } from './host-metrics.service';

@Module({
  controllers: [DashboardController],
  providers: [HostMetricsService],
})
export class DashboardModule {}
