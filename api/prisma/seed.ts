import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { requireSeedAdminPassword, seedAdminUserName } from '../src/config/seed-admin';

const prisma = new PrismaClient();

const menus = [
  { menuName: 'Dashboard', url: '/dashboard', position: 1 },
  { menuName: 'Search Log', url: '/search-log', position: 2 },
  { menuName: 'Realtime Log Stream', url: '/log-stream', position: 3 },
  { menuName: 'Add MikroTik', url: '/servers', position: 4 },
  { menuName: 'User Manager', url: '/users', position: 5 },
  { menuName: 'Role Manager', url: '/roles', position: 6 },
  { menuName: 'Server Manager', url: '/user-servers', position: 7 },
  { menuName: 'Server Settings', url: '/company-settings', position: 8 },
  { menuName: 'Activity Logs', url: '/activity-logs', position: 9 },
  { menuName: 'Service Info', url: '/service-info', position: 10 },
  { menuName: 'Activate License Key', url: '/license', position: 11 },
];

async function ensureMenus() {
  for (const m of menus) {
    const exists = await prisma.menu.findFirst({ where: { url: m.url } });
    if (!exists) await prisma.menu.create({ data: m });
    else if (exists.menuName !== m.menuName) {
      await prisma.menu.update({ where: { id: exists.id }, data: { menuName: m.menuName } });
    }
  }
  const license = await prisma.menu.findFirst({ where: { url: '/license' } });
  const superAdmin = await prisma.role.findFirst({ where: { roleName: 'SuperAdmin' } });
  if (license && superAdmin) {
    await prisma.roleMenu.upsert({
      where: { roleId_menuId: { roleId: superAdmin.id, menuId: license.id } },
      create: { roleId: superAdmin.id, menuId: license.id },
      update: {},
    });
  }
}

async function seedFresh() {
  const createdMenus = await Promise.all(menus.map((m) => prisma.menu.create({ data: m })));

  const superAdmin = await prisma.role.create({
    data: { roleName: 'SuperAdmin', description: 'All Permission' },
  });
  const viewOnly = await prisma.role.create({
    data: { roleName: 'view-only', description: 'view' },
  });

  await prisma.roleMenu.createMany({
    data: createdMenus.map((m) => ({ roleId: superAdmin.id, menuId: m.id })),
  });
  const viewUrls = ['/dashboard', '/log-stream', '/servers', '/search-log'];
  await prisma.roleMenu.createMany({
    data: createdMenus.filter((m) => viewUrls.includes(m.url)).map((m) => ({ roleId: viewOnly.id, menuId: m.id })),
  });

  const userName = seedAdminUserName();
  const rawPassword = requireSeedAdminPassword();
  const password = await bcrypt.hash(rawPassword, 10);
  const admin = await prisma.user.create({
    data: {
      userName,
      password,
      firstName: 'Sohel',
      lastName: null,
      email: process.env.SEED_ADMIN_EMAIL || 'sohelonlineit@gmail.com',
    },
  });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdmin.id } });

  await prisma.companySetting.create({
    data: { companyName: 'uniqbd.com Log Server', logServerUrl: 'localhost' },
  });

  await prisma.faq.createMany({
    data: [
      {
        position: 1,
        question: 'Log Server should be always powered on.',
        answer: 'Keep this server running so MikroTik syslog on UDP 514 is received.',
      },
      {
        position: 2,
        question: 'Mikrotik login credentials',
        answer:
          'Use the MikroTik API user, password and API port. Wrong credentials: the router may still save, but connectivity stays down.',
      },
      {
        position: 3,
        question: 'Logs are not showing',
        answer:
          'On MikroTik set remote syslog to this server IP, port 514. Prefix firewall logs with prerouting: and PPP with PPPLOG. Check Service Info.',
      },
    ],
  });
  console.log(`Created first SuperAdmin "${userName}". Change this password immediately.`);
}

async function main() {
  const users = await prisma.user.count();
  if (users > 0 && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    await ensureMenus();
    console.log('Existing users found. Skipping destructive seed. Menu list checked.');
    return;
  }

  if (users > 0 && process.env.ALLOW_DESTRUCTIVE_SEED === 'true') {
    await prisma.roleMenu.deleteMany();
    await prisma.userRole.deleteMany();
    await prisma.userServer.deleteMany();
    await prisma.audit.deleteMany();
    await prisma.menu.deleteMany();
    await prisma.role.deleteMany();
    await prisma.user.deleteMany();
    await prisma.companySetting.deleteMany();
    await prisma.faq.deleteMany();
  }

  await seedFresh();
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
