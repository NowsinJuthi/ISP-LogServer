import { Module } from '@nestjs/common';
import { ServiceInfoController } from './service-info.controller';

@Module({ controllers: [ServiceInfoController] })
export class ServiceInfoModule {}
