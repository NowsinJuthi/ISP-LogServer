export type AmarpinLicenseResult = {
  success?: boolean;
  valid?: boolean;
  grace?: boolean;
  cached?: boolean;
  code?: string;
  status?: string;
  message?: string;
  features?: Record<string, boolean>;
};

export class AmarpinLicense {
  constructor(options: Record<string, unknown>);
  activate(extra?: Record<string, unknown>): Promise<AmarpinLicenseResult>;
  validate(extra?: Record<string, unknown>): Promise<AmarpinLicenseResult>;
  heartbeat(extra?: Record<string, unknown>): Promise<AmarpinLicenseResult>;
  deactivateInstallation(extra?: Record<string, unknown>): Promise<AmarpinLicenseResult>;
  lastResult(): AmarpinLicenseResult | null;
  isAllowed(): boolean;
}
