import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type AuditActor = { id?: number; userName?: string };

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async write(input: {
    actor?: AuditActor;
    type: string;
    tableName: string;
    message: string;
    details?: unknown;
  }) {
    try {
      await this.prisma.audit.create({
        data: {
          userId: input.actor?.id ?? null,
          userName: input.actor?.userName ?? null,
          type: input.type,
          tableName: input.tableName,
          newValues: input.message,
          oldValues: input.details ? JSON.stringify(input.details) : null,
        },
      });
    } catch {
      // Activity log must never block the main action.
    }
  }

  async list(q: { search?: string; type?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, q.page || 1);
    const pageSize = Math.min(100, Math.max(10, q.pageSize || 25));
    const where: Prisma.AuditWhereInput = {};
    if (q.type) where.type = q.type;
    if (q.search?.trim()) {
      const s = q.search.trim();
      where.OR = [
        { userName: { contains: s, mode: 'insensitive' } },
        { type: { contains: s, mode: 'insensitive' } },
        { tableName: { contains: s, mode: 'insensitive' } },
        { newValues: { contains: s, mode: 'insensitive' } },
      ];
    }
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [total, today, rows] = await Promise.all([
      this.prisma.audit.count({ where }),
      this.prisma.audit.count({ where: { createdAt: { gte: start } } }),
      this.prisma.audit.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      total,
      today,
      page,
      pageSize,
      rows: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        userName: r.userName,
        type: r.type,
        tableName: r.tableName,
        message: r.newValues || `${r.type} ${r.tableName || ''}`.trim(),
      })),
    };
  }
}
