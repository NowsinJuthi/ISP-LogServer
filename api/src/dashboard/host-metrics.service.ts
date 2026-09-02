import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { readFileSync, statfsSync } from 'fs';
import * as os from 'os';

export type HostMetrics = {
  hostname: string;
  platform: string;
  arch: string;
  cpuModel: string;
  cpuCores: number;
  cpuPercent: number;
  cpuHistory: number[];
  load1: number;
  load5: number;
  load15: number;
  memory: { total: number; used: number; available: number; percent: number };
  swap: { total: number; used: number; percent: number };
  disk: { total: number; used: number; free: number; percent: number };
  network: { rxBps: number; txBps: number };
  uptimeSec: number;
  sampledAt: string;
};

type CpuTimes = { idle: number; total: number };
type NetTotals = { rx: number; tx: number; at: number };

@Injectable()
export class HostMetricsService implements OnModuleInit, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private prevCpu: CpuTimes | null = null;
  private prevNet: NetTotals | null = null;
  private cpuPercent = 0;
  private cpuHistory: number[] = [];
  private net = { rxBps: 0, txBps: 0 };
  private snapshot: HostMetrics = this.buildSnapshot();

  onModuleInit() {
    this.snapshot = this.buildSnapshot();
    this.timer = setInterval(() => {
      this.snapshot = this.buildSnapshot();
    }, 2000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  current(): HostMetrics {
    return this.snapshot;
  }

  private buildSnapshot(): HostMetrics {
    this.sampleCpu();
    this.sampleNet();
    const mem = this.readMemory();
    const disk = this.readDisk();
    const load = os.loadavg();
    const cpus = os.cpus();
    return {
      hostname: this.readHostname(),
      platform: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: (cpus[0]?.model || 'CPU').replace(/\s+/g, ' ').trim(),
      cpuCores: cpus.length || 1,
      cpuPercent: this.cpuPercent,
      cpuHistory: [...this.cpuHistory],
      load1: Number(load[0]?.toFixed(2) || 0),
      load5: Number(load[1]?.toFixed(2) || 0),
      load15: Number(load[2]?.toFixed(2) || 0),
      memory: mem.memory,
      swap: mem.swap,
      disk,
      network: this.net,
      uptimeSec: Math.floor(os.uptime()),
      sampledAt: new Date().toISOString(),
    };
  }

  private sampleCpu() {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;
    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }
    if (this.prevCpu && total > this.prevCpu.total) {
      const dTotal = total - this.prevCpu.total;
      const dIdle = idle - this.prevCpu.idle;
      this.cpuPercent = Math.min(100, Math.max(0, (1 - dIdle / dTotal) * 100));
      this.cpuHistory.push(Number(this.cpuPercent.toFixed(1)));
      if (this.cpuHistory.length > 30) this.cpuHistory.shift();
    }
    this.prevCpu = { idle, total };
  }

  private sampleNet() {
    const now = Date.now();
    const totals = this.readNetTotals();
    if (!totals) {
      this.net = { rxBps: 0, txBps: 0 };
      return;
    }
    if (this.prevNet && now > this.prevNet.at) {
      const dt = (now - this.prevNet.at) / 1000;
      this.net = {
        rxBps: Math.max(0, (totals.rx - this.prevNet.rx) / dt),
        txBps: Math.max(0, (totals.tx - this.prevNet.tx) / dt),
      };
    }
    this.prevNet = { ...totals, at: now };
  }

  private readHostname() {
    const fromEnv = process.env.HOST_HOSTNAME?.trim();
    if (fromEnv) return fromEnv;
    for (const file of ['/run/host-hostname', '/etc/hostname']) {
      try {
        const name = readFileSync(file, 'utf8').trim().split('\n')[0]?.trim();
        if (name) return name;
      } catch {
        /* try next */
      }
    }
    return os.hostname() || 'log-server';
  }

  private readMemory() {
    const info = this.readMeminfo();
    const total = info?.MemTotal || os.totalmem();
    const available = info?.MemAvailable ?? os.freemem();
    const used = Math.max(0, total - available);
    const swapTotal = info?.SwapTotal || 0;
    const swapFree = info?.SwapFree || 0;
    const swapUsed = Math.max(0, swapTotal - swapFree);
    return {
      memory: {
        total,
        used,
        available,
        percent: total ? (used / total) * 100 : 0,
      },
      swap: {
        total: swapTotal,
        used: swapUsed,
        percent: swapTotal ? (swapUsed / swapTotal) * 100 : 0,
      },
    };
  }

  private readMeminfo() {
    try {
      const map: Record<string, number> = {};
      for (const line of readFileSync('/proc/meminfo', 'utf8').split('\n')) {
        const m = /^(\w+):\s+(\d+)/.exec(line);
        if (m) map[m[1]] = Number(m[2]) * 1024;
      }
      return map;
    } catch {
      return null;
    }
  }

  private readDisk() {
    const paths = [process.env.LOG_FILE_DIR, '/var/lib/logserver/logs', '/', process.cwd()].filter(
      (p): p is string => Boolean(p),
    );
    for (const path of paths) {
      try {
        const s = statfsSync(path);
        const bsize = Number(s.bsize || 0);
        const total = Number(s.blocks) * bsize;
        const free = Number(s.bavail ?? s.bfree) * bsize;
        const used = Math.max(0, total - free);
        if (total > 0) {
          return { total, used, free, percent: (used / total) * 100 };
        }
      } catch {
        /* try next path */
      }
    }
    return { total: 0, used: 0, free: 0, percent: 0 };
  }

  private readNetTotals() {
    try {
      const lines = readFileSync('/proc/net/dev', 'utf8').split('\n').slice(2);
      let rx = 0;
      let tx = 0;
      let found = false;
      for (const line of lines) {
        const parts = line.trim().split(/[:\s]+/);
        const name = parts[0];
        if (!name || name === 'lo' || /^(docker|veth|br-|virbr|tun|tap|cni)/.test(name)) continue;
        rx += Number(parts[1]) || 0;
        tx += Number(parts[9]) || 0;
        found = true;
      }
      return found ? { rx, tx } : null;
    } catch {
      return null;
    }
  }
}
