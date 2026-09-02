-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('NAT_ACCESS', 'NAT', 'ACCESS', 'RAW');

-- CreateEnum
CREATE TYPE "RetentionPeriod" AS ENUM ('SIX_MONTHS', 'ONE_YEAR');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "userName" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "isActivated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "roleName" TEXT NOT NULL,
    "description" TEXT,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,
    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" SERIAL NOT NULL,
    "menuName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleMenu" (
    "roleId" INTEGER NOT NULL,
    "menuId" INTEGER NOT NULL,
    CONSTRAINT "RoleMenu_pkey" PRIMARY KEY ("roleId","menuId")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" SERIAL NOT NULL,
    "serverName" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "logServerUrl" TEXT NOT NULL DEFAULT 'localhost',
    "userName" TEXT,
    "password" TEXT,
    "port" TEXT,
    "type" "ServerType" NOT NULL DEFAULT 'NAT_ACCESS',
    "type1" TEXT,
    "natIp" TEXT,
    "natRouterId" TEXT,
    "listeningPort" INTEGER NOT NULL DEFAULT 514,
    "retention" "RetentionPeriod" NOT NULL DEFAULT 'SIX_MONTHS',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "connectivityStatus" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserServer" (
    "userId" INTEGER NOT NULL,
    "serverId" INTEGER NOT NULL,
    CONSTRAINT "UserServer_pkey" PRIMARY KEY ("userId","serverId")
);

-- CreateTable
CREATE TABLE "LogEvent" (
    "id" SERIAL NOT NULL,
    "serverId" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceReportedTime" TIMESTAMP(3),
    "userName" TEXT,
    "gateway" TEXT,
    "gatewayPort" TEXT,
    "toHost" TEXT,
    "toHostPort" TEXT,
    "fromIp" TEXT,
    "fromIpPort" TEXT,
    "macAddress" TEXT,
    "rawMessage" TEXT,
    CONSTRAINT "LogEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PppSession" (
    "id" SERIAL NOT NULL,
    "serverId" INTEGER NOT NULL,
    "user" TEXT,
    "mac" TEXT,
    "fromIp" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PppSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySetting" (
    "id" SERIAL NOT NULL,
    "companyName" TEXT NOT NULL DEFAULT 'Log Server',
    "companyLogoDirectory" TEXT,
    "logServerUrl" TEXT,
    "mobileNumber" TEXT,
    "smsSendingEnable" BOOLEAN NOT NULL DEFAULT false,
    "smsProviderUserId" TEXT,
    "smsProviderSender" TEXT,
    "smsProviderPassword" TEXT,
    "smsProviderId" TEXT,
    "smsSentToday" INTEGER NOT NULL DEFAULT 0,
    "lastSmsSend" TIMESTAMP(3),
    CONSTRAINT "CompanySetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "userName" TEXT,
    "type" TEXT,
    "tableName" TEXT,
    "oldValues" TEXT,
    "newValues" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Faq" (
    "id" SERIAL NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Faq_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_userName_key" ON "User"("userName");
CREATE UNIQUE INDEX "Role_roleName_key" ON "Role"("roleName");
CREATE INDEX "LogEvent_serverId_receivedAt_idx" ON "LogEvent"("serverId", "receivedAt");
CREATE INDEX "LogEvent_userName_idx" ON "LogEvent"("userName");
CREATE INDEX "LogEvent_fromIp_idx" ON "LogEvent"("fromIp");
CREATE INDEX "LogEvent_macAddress_idx" ON "LogEvent"("macAddress");
CREATE INDEX "PppSession_serverId_fromIp_idx" ON "PppSession"("serverId", "fromIp");

ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleMenu" ADD CONSTRAINT "RoleMenu_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoleMenu" ADD CONSTRAINT "RoleMenu_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserServer" ADD CONSTRAINT "UserServer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserServer" ADD CONSTRAINT "UserServer_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LogEvent" ADD CONSTRAINT "LogEvent_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PppSession" ADD CONSTRAINT "PppSession_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Audit" ADD CONSTRAINT "Audit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
