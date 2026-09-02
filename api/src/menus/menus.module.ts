import { Module } from '@nestjs/common';
import { MenusController } from './menus.controller';

@Module({ controllers: [MenusController] })
export class MenusModule {}
