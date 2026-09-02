export const RETENTION_LICENSE_MESSAGE =
  '3 months, 6 months and 1 year Auto Log Delete require an active license on this server.';

export const ROUTER_LICENSE_MESSAGE =
  'Unlicensed servers can add only one MikroTik. Activate a license key to add more.';

/** Fixed vendor contacts. Not stored in the database and not editable in the UI. */
export const LICENSE_VENDOR = {
  name: 'License administrator',
  whatsapp: '01777139777',
  whatsappLink: 'https://wa.me/8801777139777',
  facebook: 'fb.com/uniqbd.online',
  facebookLink: 'https://fb.com/uniqbd.online',
  website: 'uniqbd.com',
  websiteLink: 'https://uniqbd.com',
} as const;

function trim(name: string): string {
  return (process.env[name] || '').trim();
}

export function licenseSkipRequested(): boolean {
  return trim('AMARPIN_LICENSE_SKIP') === 'true';
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function licenseConfigured(): boolean {
  return !!(trim('AMARPIN_LICENSE_KEY') && trim('AMARPIN_SITE_SECRET'));
}

export function assertLicenseEnv() {
  if (licenseSkipRequested()) {
    if (isProduction()) {
      throw new Error('AMARPIN_LICENSE_SKIP is not allowed in production.');
    }
    return;
  }
  if (!isProduction() && !licenseConfigured()) {
    return;
  }
}
