export const RETENTION_LICENSE_MESSAGE =
  '3 months, 6 months and 1 year Auto Log Delete require an active license on this server.';

export const ROUTER_LICENSE_MESSAGE =
  'Unlicensed servers can add only one MikroTik. Activate a license key to add more.';

/**
 * Amarpin connection — compiled into the API, not read from .env.
 * Customer keys are still pasted on the Activate License Key page.
 * AMARPIN_LICENSE_KEY here is optional; leave empty unless this build
 * should auto-load a key before anyone uses the website.
 */
export const AMARPIN_API_URL = 'https://license.amarpin.com/api';
export const AMARPIN_LICENSE_KEY = '';
export const AMARPIN_SITE_SECRET = '';
export const AMARPIN_PRODUCT_ID = 'log-server';
export const AMARPIN_APP_VERSION = '1.0.0';

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

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function licenseConfigured(): boolean {
  return !!AMARPIN_API_URL.trim();
}

export function assertLicenseEnv() {
  if ((process.env.AMARPIN_LICENSE_SKIP || '').trim() === 'true' && isProduction()) {
    throw new Error('AMARPIN_LICENSE_SKIP is not allowed in production.');
  }
}
