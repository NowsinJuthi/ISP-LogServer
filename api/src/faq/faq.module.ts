import { Module } from '@nestjs/common';
import { FaqController } from './faq.controller';

@Module({ controllers: [FaqController] })
export class FaqModule {}
