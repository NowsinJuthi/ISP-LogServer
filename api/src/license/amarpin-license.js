/**
 * Amarpin License Manager — server-side SDK.
 *
 * Call this from Node / Next.js server routes only. Browser-only checks
 * are not protection. Default validate interval: 6 hours. Grace: 72 hours
 * on transport failure. REVOKED, SUSPENDED, EXPIRED, and INACTIVE are
 * honored immediately (no grace).
 *
 * HMAC matches the license API: canonical JSON, omit hmac / signature / idToken.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const dns = require('dns');
const { URL } = require('url');

const HMAC_OMIT = { hmac: true, signature: true, idToken: true };
const DEFAULT_API_URL = 'https://license.amarpin.com/api';
const NEGATIVE = {
  REVOKED: true,
  SUSPENDED: true,
  EXPIRED: true,
  INACTIVE: true,
  DEACTIVATED: true,
  INVALID_LICENSE: true,
  PRODUCT_MISMATCH: true,
  ACTIVATION_LIMIT: true,
  NOT_ACTIVATED: true
};
const TRANSPORT_SOFT = {
  RATE_LIMITED: true,
  SERVER_ERROR: true
};

function canonicalJson(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  const type = typeof value;
  if (type === 'number' || type === 'boolean' || type === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map(canonicalJson).join(',') + ']';
  }
  if (type === 'object') {
    const keys = Object.keys(value)
      .filter(function (key) {
        return !HMAC_OMIT[key] && value[key] !== undefined;
      })
      .sort();
    return (
      '{' +
      keys.map(function (key) {
        return JSON.stringify(key) + ':' + canonicalJson(value[key]);
      }).join(',') +
      '}'
    );
  }
  return JSON.stringify(String(value));
}

function signHmac(body, secret) {
  return crypto.createHmac('sha256', String(secret)).update(canonicalJson(body)).digest('base64');
}

function verifyHmac(body, signature, secret) {
  if (!secret || !signature) {
    return false;
  }
  const expected = signHmac(body, secret);
  const given = String(signature).trim().replace(/\s/g, '');
  return timingSafeEqual(given, expected) || timingSafeEqual(given.toLowerCase(), hmacHex(body, secret));
}

function hmacHex(body, secret) {
  return crypto.createHmac('sha256', String(secret)).update(canonicalJson(body)).digest('hex');
}

function verifyRsa(body, signature, publicPem) {
  if (!publicPem || !signature) {
    return false;
  }
  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(canonicalJson(body));
    verifier.end();
    return verifier.verify(publicPem, Buffer.from(String(signature), 'base64'));
  } catch (err) {
    return false;
  }
}

function timingSafeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function normalizeFeatureKey(value) {
  let text = String(value || '').trim();
  if (!text) {
    return '';
  }
  text = text.replace(/[-_\s]+([a-zA-Z0-9])/g, function (_, ch) {
    return ch.toUpperCase();
  });
  text = text.charAt(0).toLowerCase() + text.substring(1);
  text = text.replace(/[^a-zA-Z0-9]/g, '');
  return text.substring(0, 64);
}

function makeNonce() {
  return crypto.randomBytes(16).toString('hex');
}

function positiveNumber(value, fallback) {
  const n = Number(value);
  if (!isFinite(n) || n <= 0) {
    return fallback;
  }
  return n;
}

function isUsable(result) {
  return !!(result && result.success !== false && result.valid === true);
}

function isExplicitNegative(result) {
  if (!result || result.success === false) {
    return false;
  }
  if (result.valid === true) {
    return false;
  }
  const code = String(result.code || result.status || '').toUpperCase();
  return !!NEGATIVE[code];
}

function isTransportSoft(result, httpStatus) {
  if (httpStatus && httpStatus >= 500) {
    return true;
  }
  if (!result) {
    return true;
  }
  if (result.success === false && TRANSPORT_SOFT[String(result.code || '').toUpperCase()]) {
    return true;
  }
  return false;
}

function MemoryStore() {
  this.map = Object.create(null);
}

MemoryStore.prototype.get = function (key) {
  return this.map[key] || null;
};

MemoryStore.prototype.set = function (key, value) {
  this.map[key] = value;
};

function FileStore(filePath) {
  this.filePath = filePath;
}

FileStore.prototype.readAll = function () {
  try {
    return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
  } catch (err) {
    return {};
  }
};

FileStore.prototype.get = function (key) {
  const all = this.readAll();
  return all[key] || null;
};

FileStore.prototype.set = function (key, value) {
  const all = this.readAll();
  all[key] = value;
  const dir = path.dirname(this.filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = this.filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(all));
  fs.renameSync(tmp, this.filePath);
};

function lookupIpv4(hostname) {
  return new Promise(function (resolve, reject) {
    dns.lookup(hostname, { family: 4, all: false }, function (err, address) {
      if (err) {
        dns.lookup(hostname, { family: 0, all: false }, function (err2, address2) {
          if (err2) reject(err2);
          else resolve(address2);
        });
        return;
      }
      resolve(address);
    });
  });
}

function postJson(urlString, payload, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let hops = 0;
    let settled = false;
    function done(err, value) {
      if (settled) return;
      settled = true;
      if (err) reject(err);
      else resolve(value);
    }
    function send(currentUrl) {
      if (hops++ > 5) {
        done(new Error('Too many redirects'));
        return;
      }
      const u = new URL(currentUrl);
      const lib = u.protocol === 'http:' ? http : https;
      const raw = JSON.stringify(payload);
      lookupIpv4(u.hostname).then(function (address) {
        if (settled) return;
        const req = lib.request(
          {
            protocol: u.protocol,
            host: address,
            servername: u.hostname,
            port: u.port || undefined,
            path: u.pathname + u.search,
            method: 'POST',
            family: 4,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'content-length': Buffer.byteLength(raw),
              accept: 'application/json',
              host: u.host,
              'user-agent': 'amarpin-license-sdk/15'
            }
          },
          function (res) {
            const loc = res.headers.location;
            if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
              res.resume();
              send(new URL(loc, currentUrl).toString());
              return;
            }
            const chunks = [];
            res.on('data', function (chunk) {
              chunks.push(chunk);
            });
            res.on('end', function () {
              const text = Buffer.concat(chunks).toString('utf8');
              let json = null;
              try {
                json = JSON.parse(text);
              } catch (err) {
                json = null;
              }
              done(null, { status: res.statusCode, text: text, json: json });
            });
          }
        );
        req.on('error', function (err) {
          done(err);
        });
        req.setTimeout(timeoutMs, function () {
          req.destroy();
          const err = new Error('Request timed out');
          err.code = 'TIMEOUT';
          done(err);
        });
        req.end(raw);
      }).catch(done);
    }
    send(urlString);
  });
}

function featureEnabled(features, name) {
  if (!features || typeof features !== 'object') {
    return false;
  }
  const key = normalizeFeatureKey(name);
  if (!key) {
    return false;
  }
  return features[key] === true;
}

class AmarpinLicense {
  constructor(options) {
    options = options || {};
    this.apiUrl = String(options.apiUrl || DEFAULT_API_URL).replace(/\/$/, '');
    this.licenseKey = String(options.licenseKey || '').trim();
    this.productId = String(options.productId || options.productCode || '').trim();
    this.installationId = String(options.installationId || '').trim();
    this.websiteId = String(options.websiteId || '').trim();
    this.siteApiKeyId = String(options.siteApiKeyId || '').trim();
    this.siteSecret = String(options.siteSecret || options.hmacSecret || '').trim();
    this.version = String(options.version || '').trim();
    this.validationIntervalHours = positiveNumber(options.validationIntervalHours, 6);
    this.gracePeriodHours = positiveNumber(options.gracePeriodHours, 72);
    this.timeoutMs = positiveNumber(options.timeoutMs, 15000);
    this.verifyResponseHmac = options.verifyResponseHmac !== false;
    this.rsaPublicKey = String(options.rsaPublicKey || '').trim();
    this.store = options.cache || (options.cachePath ? new FileStore(options.cachePath) : new MemoryStore());
  }

  activate(extra) {
    return this._call('activate', extra || {}, { force: true, requireInstallation: true, allowGrace: false });
  }

  validate(extra) {
    extra = extra || {};
    return this._ensureChecked('validate', extra);
  }

  getStatus(extra) {
    extra = extra || {};
    return this._ensureChecked('getStatus', extra);
  }

  getFeatures(extra) {
    extra = extra || {};
    return this._ensureChecked('getFeatures', extra).then(function (result) {
      if (!isUsable(result)) {
        return Object.assign({}, result, { features: {} });
      }
      return result;
    });
  }

  hasFeature(name, extra) {
    extra = extra || {};
    const key = normalizeFeatureKey(name);
    const self = this;
    if (!key) {
      return Promise.resolve(false);
    }
    return this._ensureChecked('validate', extra).then(function (result) {
      if (!isUsable(result)) {
        return false;
      }
      if (result.features && typeof result.features === 'object') {
        return featureEnabled(result.features, key);
      }
      return self
        ._call('hasFeature', Object.assign({}, extra, { feature: key }), { force: true })
        .then(function (payload) {
          return !!(payload && payload.valid === true && payload.enabled === true);
        });
    });
  }

  deactivateInstallation(extra) {
    return this._call('deactivateInstallation', extra || {}, { force: true, requireInstallation: true, allowGrace: false });
  }

  heartbeat(extra) {
    extra = extra || {};
    return this._ensureChecked('heartbeat', extra);
  }

  lastResult() {
    const row = this._readCache();
    return row && row.last && row.last.result ? row.last.result : null;
  }

  isAllowed() {
    return isUsable(this.lastResult());
  }

  _cacheKey() {
    return ['v1', this.licenseKey, this.installationId].join(':');
  }

  _readCache() {
    try {
      return this.store.get(this._cacheKey());
    } catch (err) {
      return null;
    }
  }

  _writeCache(row) {
    try {
      this.store.set(this._cacheKey(), row);
    } catch (err) {}
  }

  _intervalMs(result) {
    const seconds = result && Number(result.nextCheckAfterSeconds);
    if (isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    return this.validationIntervalHours * 3600 * 1000;
  }

  _graceMs(result) {
    const hours = result && Number(result.gracePeriodHours);
    if (isFinite(hours) && hours > 0) {
      return hours * 3600 * 1000;
    }
    return this.gracePeriodHours * 3600 * 1000;
  }

  _freshNetwork(row, extra, action) {
    if (extra && extra.force) {
      return false;
    }
    if (!row || !row.last || row.last.transportError) {
      return false;
    }
    const age = Date.now() - Number(row.last.at || 0);
    if (age < 0 || age >= this._intervalMs(row.last.result)) {
      return false;
    }
    const result = row.last.result || {};
    if (action === 'validate' || action === 'heartbeat' || action === 'getFeatures') {
      return !!(result.features && typeof result.features === 'object');
    }
    return true;
  }

  _graceResult(row) {
    if (!row || !row.lastValid || !row.lastValid.result) {
      return null;
    }
    const age = Date.now() - Number(row.lastValid.at || 0);
    if (age < 0 || age > this._graceMs(row.lastValid.result)) {
      return null;
    }
    return Object.assign({}, row.lastValid.result, { grace: true });
  }

  _ensureChecked(action, extra) {
    extra = extra || {};
    const row = this._readCache();
    if (this._freshNetwork(row, extra, action)) {
      return Promise.resolve(Object.assign({}, row.last.result, { cached: true }));
    }
    return this._call(action, extra, { force: true });
  }

  _baseFields(extra) {
    extra = extra || {};
    const body = { action: extra.action };
    const licenseKey = String(extra.licenseKey || this.licenseKey || '').trim();
    const productId = String(extra.productId || extra.productCode || this.productId || '').trim();
    const installationId = String(extra.installationId || this.installationId || '').trim();
    const websiteId = String(extra.websiteId || this.websiteId || '').trim();
    const siteApiKeyId = String(extra.siteApiKeyId || this.siteApiKeyId || '').trim();
    const version = String(extra.version || this.version || '').trim();
    if (licenseKey) {
      body.licenseKey = licenseKey;
    }
    if (productId) {
      body.productId = productId;
    }
    if (installationId) {
      body.installationId = installationId;
    }
    if (websiteId) {
      body.websiteId = websiteId;
    }
    if (siteApiKeyId) {
      body.siteApiKeyId = siteApiKeyId;
    }
    if (version) {
      body.version = version;
    }
    if (extra.feature) {
      body.feature = extra.feature;
    }
    return body;
  }

  _call(action, extra, opts) {
    extra = extra || {};
    opts = opts || {};
    const secret = String(
      extra.siteSecret || extra.hmacSecret || this.siteSecret || extra.licenseKey || this.licenseKey || ''
    ).trim();
    if (!secret) {
      return Promise.reject(new Error('licenseKey is required'));
    }
    const body = this._baseFields(Object.assign({}, extra, { action: action }));
    if (!body.licenseKey) {
      return Promise.reject(new Error('licenseKey is required'));
    }
    if (opts.requireInstallation && !body.installationId) {
      return Promise.reject(new Error('installationId is required'));
    }

    body.timestamp = Math.floor(Date.now() / 1000);
    body.nonce = makeNonce();
    body.hmac = signHmac(body, secret);

    const allowGrace = opts.allowGrace !== false;
    const self = this;
    return postJson(this.apiUrl, body, this.timeoutMs)
      .then(function (res) {
        return self._handleResponse(res, secret, allowGrace);
      })
      .catch(function (err) {
        return self._failTransport(err, allowGrace);
      });
  }

  _handleResponse(res, secret, allowGrace) {
    const json = res && res.json;
    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      return this._failTransport(new Error('Invalid JSON response'), allowGrace);
    }
    if (!this._signatureOk(json, secret)) {
      return this._failTransport(new Error('Response signature mismatch'), allowGrace);
    }
    if (isTransportSoft(json, res.status)) {
      return this._failTransport(new Error(json.message || json.code || 'Transport error'), allowGrace);
    }
    if (json.success === false && json.code === 'UNAUTHORIZED') {
      this._storeNetwork(Object.assign({}, json, { valid: false }), false, true);
      return Object.assign({}, json, { valid: false });
    }
    if (json.success === false) {
      return this._failTransport(new Error(json.message || json.code || 'Request failed'), allowGrace);
    }
    this._storeNetwork(json, isUsable(json), isExplicitNegative(json));
    return json;
  }

  _signatureOk(payload, secret) {
    const signedWith = String(payload.signedWith || '').toUpperCase();
    if (!payload.signature) {
      return true;
    }
    if (signedWith === 'RSA') {
      if (!this.rsaPublicKey) {
        return true;
      }
      return verifyRsa(payload, payload.signature, this.rsaPublicKey);
    }
    if (!this.verifyResponseHmac) {
      return true;
    }
    return verifyHmac(payload, payload.signature, secret);
  }

  _storeNetwork(result, usable, clearValid) {
    const now = Date.now();
    const prev = this._readCache() || {};
    const row = {
      last: { at: now, result: result, transportError: false },
      lastValid: prev.lastValid || null
    };
    if (usable) {
      row.lastValid = { at: now, result: result };
    } else if (clearValid || isExplicitNegative(result)) {
      row.lastValid = null;
    }
    this._writeCache(row);
  }

  _failTransport(err, allowGrace) {
    const row = this._readCache() || {};
    row.last = {
      at: Date.now(),
      result: {
        success: false,
        valid: false,
        code: 'TRANSPORT_ERROR',
        message: err && err.message ? String(err.message) : 'Transport error'
      },
      transportError: true
    };
    this._writeCache(row);
    if (allowGrace !== false) {
      const grace = this._graceResult(row);
      if (grace) {
        return grace;
      }
    }
    return row.last.result;
  }
}

module.exports = {
  AmarpinLicense,
  canonicalJson,
  signHmac,
  verifyHmac,
  normalizeFeatureKey
};
module.exports.default = AmarpinLicense;
