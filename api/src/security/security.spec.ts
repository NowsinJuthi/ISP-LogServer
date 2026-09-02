import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cookieSecure, getJwtSecret, parseDurationMs } from '../config/env';
import {
  assertLoginAllowed,
  clearLoginFailures,
  loginKey,
  recordLoginFailure,
  resetLoginThrottleForTests,
} from '../auth/login-throttle';
import {
  canAccessServer,
  canAssignRouters,
  canManageRoles,
  isActiveUser,
} from '../auth/auth-user';
import { csrfAllowed } from '../auth/csrf.middleware';
import { evaluateAccess } from '../auth/menus.guard';
import { requireSeedAdminPassword } from '../config/seed-admin';
import { bumpReceivedToday, currentReceivedToday, resetSyslogStateForTests, syslogState } from '../syslog/syslog.state';
import { SessionTable } from '../syslog/session-table';
import {
  applyWanNat,
  isPrivateIp,
  isSessionLine,
  normalizeMac,
  parseDhcp,
  parseMac,
  parseNat,
  parsePpp,
  parseUser,
} from '../syslog/syslog.parse';
import {
  assertSafeSmsUrl,
  assertSafeSmtpPort,
  assertSafeSmtpTarget,
  isBlockedProbeIp,
  parseHostAndPort,
  parseIpv4,
  redactSecretMessage,
} from './net-guard';
import { addressLookup, clampPage, clampPageSize, parseOptionalDate } from './pagination';
import { DUMMY_ROUTER_PASSWORD, publicServer } from './redact';

const admin: import('../auth/auth-user').AuthUser = {
  id: 1,
  userName: 'a',
  isAdmin: true,
  isViewOnly: false,
  menuUrls: [],
  serverIds: [],
};
const viewOnly: import('../auth/auth-user').AuthUser = {
  id: 2,
  userName: 'v',
  isAdmin: false,
  isViewOnly: true,
  menuUrls: ['/dashboard', '/search-log', '/log-stream', '/servers'],
  serverIds: [9],
};
const userManager: import('../auth/auth-user').AuthUser = {
  id: 3,
  userName: 'u',
  isAdmin: false,
  isViewOnly: false,
  menuUrls: ['/users'],
  serverIds: [],
};
const roleManager: import('../auth/auth-user').AuthUser = {
  id: 4,
  userName: 'r',
  isAdmin: false,
  isViewOnly: false,
  menuUrls: ['/roles'],
  serverIds: [],
};
const serverManager: import('../auth/auth-user').AuthUser = {
  id: 5,
  userName: 's',
  isAdmin: false,
  isViewOnly: false,
  menuUrls: ['/user-servers'],
  serverIds: [],
};

test('rejects missing and default JWT secrets', () => {
  const prev = process.env.JWT_SECRET;
  const node = process.env.NODE_ENV;
  process.env.NODE_ENV = 'development';
  delete process.env.JWT_SECRET;
  assert.throws(() => getJwtSecret(), /required/i);
  process.env.JWT_SECRET = 'dev-secret-change-me';
  assert.throws(() => getJwtSecret(), /insecure/i);
  process.env.JWT_SECRET = 'short';
  assert.throws(() => getJwtSecret(), /at least/i);
  process.env.JWT_SECRET = 'logserver-dev-jwt-secret-ok';
  assert.equal(getJwtSecret(), 'logserver-dev-jwt-secret-ok');
  if (prev === undefined) delete process.env.JWT_SECRET;
  else process.env.JWT_SECRET = prev;
  if (node === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = node;
});

test('parses JWT duration', () => {
  assert.equal(parseDurationMs('7d'), 7 * 24 * 60 * 60 * 1000);
  assert.equal(parseDurationMs('15m'), 15 * 60 * 1000);
});

test('cookieSecure follows production flag', () => {
  const prev = process.env.NODE_ENV;
  const cookie = process.env.COOKIE_SECURE;
  process.env.NODE_ENV = 'development';
  delete process.env.COOKIE_SECURE;
  assert.equal(cookieSecure(), false);
  process.env.COOKIE_SECURE = 'true';
  assert.equal(cookieSecure(), true);
  process.env.NODE_ENV = 'production';
  process.env.COOKIE_SECURE = 'false';
  assert.equal(cookieSecure(), false);
  process.env.NODE_ENV = prev;
  if (cookie === undefined) delete process.env.COOKIE_SECURE;
  else process.env.COOKIE_SECURE = cookie;
});

test('blocks metadata, loopback, and multicast probe IPs', () => {
  assert.equal(isBlockedProbeIp('169.254.169.254'), true);
  assert.equal(isBlockedProbeIp('127.0.0.1'), true);
  assert.equal(isBlockedProbeIp('0.0.0.0'), true);
  assert.equal(isBlockedProbeIp('224.0.0.1'), true);
  assert.equal(isBlockedProbeIp('192.168.88.1'), false);
  assert.equal(isBlockedProbeIp('10.0.0.2'), false);
  assert.equal(parseIpv4('256.1.1.1'), null);
});

test('rejects unsafe router hosts', () => {
  assert.throws(() => parseHostAndPort('http://evil.test', 80));
  assert.throws(() => parseHostAndPort('host/path', 80));
  assert.throws(() => parseHostAndPort('host:80', 80));
  assert.throws(() => parseHostAndPort('192.168.1.1', 0));
  const ok = parseHostAndPort('192.168.88.1', '8728');
  assert.equal(ok.host, '192.168.88.1');
  assert.equal(ok.port, 8728);
});

test('redacts router passwords', () => {
  const row = publicServer({ id: 1, url: '10.0.0.1', password: 'secret', type: 'NAT' });
  assert.equal('password' in row, false);
  assert.equal(row.passwordSet, true);
  const raw = publicServer({ id: 2, password: DUMMY_ROUTER_PASSWORD });
  assert.equal(raw.passwordSet, false);
});

test('clamps pagination and dates', () => {
  assert.equal(clampPage(-1), 1);
  assert.equal(clampPage('nope'), 1);
  assert.equal(clampPageSize(9999, 100, 200), 200);
  assert.equal(parseOptionalDate('not-a-date'), null);
  assert.ok(parseOptionalDate('2026-08-30') instanceof Date);
  const dhakaMidnight = parseOptionalDate('2026-09-02T00:00:00');
  assert.ok(dhakaMidnight instanceof Date);
  assert.equal(dhakaMidnight.toISOString(), '2026-09-01T18:00:00.000Z');
  assert.deepEqual(addressLookup('8.8.8.8'), { equals: '8.8.8.8' });
  assert.deepEqual(addressLookup('8.8.8'), { startsWith: '8.8.8' });
});

test('SMS URLs must be https and allowlisted', () => {
  assert.throws(() => assertSafeSmsUrl('http://api.smsq.global/x', ['api.smsq.global']));
  assert.throws(() => assertSafeSmsUrl('https://evil.test/x', ['api.smsq.global']));
  assert.throws(() => assertSafeSmsUrl('https://user:pass@api.smsq.global/x', ['api.smsq.global']));
  const url = assertSafeSmsUrl('https://api.smsq.global/api/SendSMS', ['api.smsq.global']);
  assert.equal(url.hostname, 'api.smsq.global');
});

test('server and log IDOR: admin or assigned only', () => {
  assert.equal(canAccessServer(admin, 99), true);
  assert.equal(canAccessServer(viewOnly, 9), true);
  assert.equal(canAccessServer(viewOnly, 8), false);
  assert.equal(canAccessServer(userManager, 9), false);
});

test('seed requires a strong SEED_ADMIN_PASSWORD', () => {
  assert.throws(() => requireSeedAdminPassword({}), /required/i);
  assert.throws(() => requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: '' }), /required/i);
  assert.throws(() => requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: 'short' }), /weak/i);
  assert.throws(() => requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: 'Admin@12345' }), /weak/i);
  assert.equal(requireSeedAdminPassword({ SEED_ADMIN_PASSWORD: 'Unique-First-Admin-9' }), 'Unique-First-Admin-9');
});

test('role mutations require /roles; /users is not enough', () => {
  assert.equal(canManageRoles(admin), true);
  assert.equal(canManageRoles(roleManager), true);
  assert.equal(canManageRoles(userManager), false);
  assert.equal(canManageRoles(viewOnly), false);
  assert.equal(evaluateAccess(userManager, { write: true, menus: ['/roles'] }).ok, false);
  assert.equal(evaluateAccess(roleManager, { write: true, menus: ['/roles'] }).ok, true);
  assert.equal(evaluateAccess(userManager, { menus: ['/roles', '/users'] }).ok, true);
});

test('view-only cannot mutate', () => {
  assert.equal(evaluateAccess(viewOnly, { write: true, menus: ['/servers'] }).ok, false);
  assert.equal(evaluateAccess(viewOnly, { menus: ['/search-log'] }).ok, true);
});

test('user-server assignment is admin or Server Manager only', () => {
  assert.equal(canAssignRouters(admin), true);
  assert.equal(canAssignRouters(serverManager), true);
  assert.equal(canAssignRouters(userManager), false);
  assert.equal(canAssignRouters(viewOnly), false);
  assert.equal(evaluateAccess(userManager, { write: true, menus: ['/user-servers'] }).ok, false);
  assert.equal(evaluateAccess(serverManager, { write: true, menus: ['/user-servers'] }).ok, true);
});

test('CSRF rejects foreign origins on mutations', () => {
  const allowed = new Set(['http://localhost:3000']);
  assert.equal(csrfAllowed('GET', 'http://evil.test', undefined, allowed, true), true);
  assert.equal(csrfAllowed('POST', 'http://evil.test', undefined, allowed, true), false);
  assert.equal(csrfAllowed('POST', 'http://localhost:3000', undefined, allowed, true), true);
  assert.equal(csrfAllowed('POST', 'http://192.168.172.12', undefined, allowed, true, 'http://192.168.172.12'), true);
  assert.equal(csrfAllowed('POST', 'http://evil.test', undefined, allowed, true, 'http://192.168.172.12'), false);
  assert.equal(csrfAllowed('PUT', undefined, 'http://evil.test/x', allowed, true), false);
  assert.equal(csrfAllowed('DELETE', undefined, undefined, allowed, true), false);
  assert.equal(csrfAllowed('POST', undefined, undefined, allowed, false), true);
});

test('SMTP SSRF blocks loopback, metadata, and private hosts', async () => {
  assert.throws(() => assertSafeSmtpPort(80));
  assert.equal(assertSafeSmtpPort(587), 587);
  await assert.rejects(() => assertSafeSmtpTarget('localhost', 587));
  await assert.rejects(() => assertSafeSmtpTarget('127.0.0.1', 587));
  await assert.rejects(() => assertSafeSmtpTarget('169.254.169.254', 587));
  await assert.rejects(() => assertSafeSmtpTarget('192.168.1.10', 587));
  const pub = await assertSafeSmtpTarget('8.8.8.8', 587);
  assert.equal(pub.port, 587);
});

test('redacts credentials from log text', () => {
  assert.match(redactSecretMessage('auth password=supersecret smtp://x'), /\[redacted\]/);
  assert.equal('password' in publicServer({ password: 'hidden' }), false);
});

test('syslog daily counter resets on a new local day', () => {
  resetSyslogStateForTests();
  const morning = new Date(2026, 7, 30, 9, 0, 0);
  bumpReceivedToday(morning);
  bumpReceivedToday(morning);
  assert.equal(currentReceivedToday(morning), 2);
  const nextDay = new Date(2026, 7, 31, 0, 1, 0);
  assert.equal(currentReceivedToday(nextDay), 0);
  bumpReceivedToday(nextDay);
  assert.equal(syslogState.receivedToday, 1);
});

test('deactivated users are rejected', () => {
  assert.equal(isActiveUser(null), false);
  assert.equal(isActiveUser({ isActivated: false }), false);
  assert.equal(isActiveUser({ isActivated: true }), true);
});

test('login throttle locks after repeated failures', () => {
  resetLoginThrottleForTests();
  const key = loginKey('1.1.1.1', 'demo');
  for (let i = 0; i < 8; i += 1) recordLoginFailure(key);
  assert.throws(() => assertLoginAllowed(key), /Too many login attempts/);
  clearLoginFailures(key);
  assert.doesNotThrow(() => assertLoginAllowed(key));
});

test('parses MikroTik NAT line into separate IP, port, MAC, and user', () => {
  const raw =
    'prerouting: in:bridge out:ether1, src-mac 64:d1:54:e9:82:ca, proto TCP, 10.12.23.248:54650->172.217.116.4:443, NAT (10.12.23.248:54650->103.114.38.185:54650)->172.217.116.4:443, user=sohel';
  const n = parseNat(raw);
  assert.equal(n.fromIp, '10.12.23.248');
  assert.equal(n.fromIpPort, '54650');
  assert.equal(n.gateway, '103.114.38.185');
  assert.equal(n.gatewayPort, '54650');
  assert.equal(n.toHost, '172.217.116.4');
  assert.equal(n.toHostPort, '443');
  assert.equal(n.macAddress, '64:d1:54:e9:82:ca');
  assert.equal(n.userName, 'sohel');
  assert.equal(parseUser('<pppoe-clcuser>: authenticated'), 'clcuser');
  assert.equal(parseUser('prerouting: in:pppoe-sohel out:ether1, proto TCP'), 'sohel');
  assert.equal(normalizeMac('64d1.54e9.82ca'), '64:d1:54:e9:82:ca');
  assert.equal(parseMac('src-mac b8:d9:94:a8:b7:bb'), 'b8:d9:94:a8:b7:bb');
});

test('parses forward line without NAT and fills WAN from router IP', () => {
  const raw =
    'prerouting: in:bridge out:ether1, src-mac b8:d9:4c:eb:67:bb, proto TCP, 10.12.23.137:443->8.8.8.8:53';
  const n = parseNat(raw);
  assert.equal(n.fromIp, '10.12.23.137');
  assert.equal(n.fromIpPort, '443');
  assert.equal(n.toHost, '8.8.8.8');
  assert.equal(n.gateway, null);
  assert.equal(n.macAddress, 'b8:d9:4c:eb:67:bb');
  assert.equal(isPrivateIp('10.12.23.137'), true);
  const filled = applyWanNat(n, '103.114.38.185');
  assert.equal(filled.gateway, '103.114.38.185');
  assert.equal(filled.gatewayPort, '443');
});

test('parses to-src NAT and pppoe user on separate line styles', () => {
  const nat = parseNat(
    'srcnat: proto TCP, 10.12.23.10:5000->1.1.1.1:443 to-src 103.114.38.185:5000',
  );
  assert.equal(nat.gateway, '103.114.38.185');
  assert.equal(nat.gatewayPort, '5000');
  assert.equal(parseUser('prerouting: in:pppoe-1791firoz out:ether1, proto TCP'), '1791firoz');
});

test('session table joins user, MAC, and NAT across MikroTik line types', () => {
  const table = new SessionTable();
  const natLine = table.apply(
    1,
    parseNat(
      'prerouting: in:pppoe-1791firoz out:ether1, proto TCP, 10.12.23.137:54650->1.1.1.1:443, NAT (10.12.23.137:54650->103.114.38.185:54650)->1.1.1.1:443',
    ),
    '103.114.38.185',
  );
  assert.equal(natLine.userName, '1791firoz');
  assert.equal(natLine.gateway, '103.114.38.185');
  assert.equal(natLine.macAddress, null);

  const macLine = table.apply(
    1,
    parseNat(
      'prerouting: in:bridge out:ether1, src-mac b8:d9:4c:eb:67:bb, proto TCP, 10.12.23.137:80->8.8.8.8:53',
    ),
    '103.114.38.185',
  );
  assert.equal(macLine.userName, '1791firoz');
  assert.equal(macLine.macAddress, 'b8:d9:4c:eb:67:bb');
  assert.equal(macLine.gateway, '103.114.38.185');

  const laterNat = table.apply(
    1,
    parseNat(
      'prerouting: in:pppoe-1791firoz out:ether1, proto TCP, 10.12.23.137:443->9.9.9.9:443, NAT (10.12.23.137:443->103.114.38.185:443)->9.9.9.9:443',
    ),
    '103.114.38.185',
  );
  assert.equal(laterNat.macAddress, 'b8:d9:4c:eb:67:bb');
  assert.equal(laterNat.userName, '1791firoz');
});

test('stitch fills user and MAC across rows that share a private IP', () => {
  const table = new SessionTable();
  const rows = table.stitch(
    1,
    [
      {
        userName: null,
        fromIp: '10.12.31.231',
        fromIpPort: '57838',
        gateway: '54.204.38.16',
        gatewayPort: '443',
        toHost: '54.204.38.16',
        toHostPort: '443',
        macAddress: 'e8:69:f4:e8:b7:bb',
      },
      {
        userName: '1601abul',
        fromIp: '10.12.31.231',
        fromIpPort: '443',
        gateway: '103.114.38.8',
        gatewayPort: '443',
        toHost: '142.251.1.1',
        toHostPort: '443',
        macAddress: null,
      },
    ],
    '103.114.38.185',
  );
  assert.equal(rows[0].userName, '1601abul');
  assert.equal(rows[0].macAddress, 'e8:69:f4:e8:b7:bb');
  assert.equal(rows[1].userName, '1601abul');
  assert.equal(rows[1].macAddress, 'e8:69:f4:e8:b7:bb');
  assert.notEqual(rows[0].gateway, '54.204.38.16');
  assert.ok(rows[0].gateway === '103.114.38.8' || rows[0].gateway === '103.114.38.185');
});

test('parses PPP and DHCP session lines for user, IP, and MAC', () => {
  assert.equal(parseUser('pppoe,ppp,info <pppoe-1601abul>: connected'), '1601abul');
  assert.equal(parseUser('ppp,info 1601abul: authenticated'), '1601abul');
  assert.equal(isSessionLine('pppoe,ppp,info <pppoe-1601abul>: connected'), true);
  const dhcp = parseDhcp('dhcp,info dhcp1 assigned 10.12.31.231 to E8:69:F4:E8:B7:BB');
  assert.equal(dhcp?.fromIp, '10.12.31.231');
  assert.equal(dhcp?.mac, 'e8:69:f4:e8:b7:bb');
  const ppp = parsePpp('PPPLOG: <pppoe-1601abul>: connected, address=10.12.31.231 caller-id=E8:69:F4:E8:B7:BB');
  assert.equal(ppp.user, '1601abul');
  assert.equal(ppp.fromIp, '10.12.31.231');
  assert.equal(ppp.mac, 'e8:69:f4:e8:b7:bb');
  assert.equal(parseUser('in:pppoe-Rintu'), 'Rintu');
});
