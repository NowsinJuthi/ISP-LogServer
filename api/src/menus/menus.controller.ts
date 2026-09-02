import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequireAdmin, RequireMenus, RequireWrite } from '../auth/menus.decorator';
import { MenusGuard } from '../auth/menus.guard';
import { PrismaService } from '../prisma.service';

class MenuDto {
  @IsString()
  @MaxLength(80)
  menuName: string;
  @IsString()
  @MaxLength(120)
  @Matches(/^\/[A-Za-z0-9/_-]*$/, { message: 'Menu URL must be a site path' })
  url: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

@Controller('menus')
@UseGuards(JwtAuthGuard, MenusGuard)
export class MenusController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @RequireMenus('/roles')
  list() {
    return this.prisma.menu.findMany({
      where: { url: { notIn: ['/menus', '/faq'] } },
      orderBy: { position: 'asc' },
    });
  }

  @Post()
  @RequireAdmin()
  @RequireWrite()
  create(@Body() body: MenuDto) {
    return this.prisma.menu.create({
      data: { menuName: body.menuName, url: body.url, position: body.position ?? 0 },
    });
  }

  @Put(':id')
  @RequireAdmin()
  @RequireWrite()
  update(@Param('id', ParseIntPipe) id: number, @Body() body: MenuDto) {
    return this.prisma.menu.update({
      where: { id },
      data: { menuName: body.menuName, url: body.url, position: body.position ?? 0 },
    });
  }

  @Delete(':id')
  @RequireAdmin()
  @RequireWrite()
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.prisma.menu.delete({ where: { id } });
    return { ok: true };
  }
}
