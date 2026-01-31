import dns from 'node:dns/promises';
import net from 'node:net';

export class UnsafeExternalUrlError extends Error {
  code = 'unsafe_external_url' as const;
}

export type SafeExternalTarget = {
  url: URL;
  address: string;
  family: 4 | 6;
};

type ResolveOptions = {
  allowHttp: boolean;
  allowedHostnames?: string[];
  allowedPortsInProd?: number[];
  isProd: boolean;
};

const normalizeHostname = (hostname: string) => hostname.trim().toLowerCase().replace(/\.$/, '');

const isHostnameAllowlisted = (hostname: string, allowlist: string[]) => {
  if (allowlist.length === 0) return true;
  const normalized = normalizeHostname(hostname);
  for (const rawPattern of allowlist) {
    const pattern = normalizeHostname(rawPattern);
    if (!pattern) continue;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(2);
      if (normalized === suffix || normalized.endsWith(`.${suffix}`)) return true;
      continue;
    }
    if (normalized === pattern) return true;
  }
  return false;
};

const isPrivateIpv4 = (ip: string) => {
  const parts = ip.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;

  if (a === 0) return true; // "this host on this network"
  if (a === 10) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved

  return false;
};

const isPrivateIp = (ip: string) => {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIpv4(ip);
  if (family !== 6) return true;

  const normalized = ip.toLowerCase();
  if (normalized === '::' || normalized === '::1') return true;

  if (normalized.startsWith('::ffff:')) {
    const maybeIpv4 = normalized.slice('::ffff:'.length);
    if (net.isIP(maybeIpv4) === 4) return isPrivateIpv4(maybeIpv4);
  }

  const firstHextet = normalized.split(':')[0] ?? '';
  if (firstHextet.startsWith('fc') || firstHextet.startsWith('fd')) return true; // fc00::/7

  const firstFour = normalized.replace(':', '').slice(0, 4);
  if (
    firstFour.startsWith('fe8') ||
    firstFour.startsWith('fe9') ||
    firstFour.startsWith('fea') ||
    firstFour.startsWith('feb')
  ) {
    return true; // fe80::/10
  }

  if (normalized.startsWith('2001:db8:')) return true; // documentation

  return false;
};

export const resolveSafeExternalTarget = async (rawUrl: string, options: ResolveOptions): Promise<SafeExternalTarget> => {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (_err) {
    throw new UnsafeExternalUrlError('Invalid URL');
  }

  if (parsed.protocol !== 'https:' && (!options.allowHttp || options.isProd || parsed.protocol !== 'http:')) {
    throw new UnsafeExternalUrlError('URL must use https');
  }

  if (parsed.username || parsed.password) {
    throw new UnsafeExternalUrlError('URL must not contain credentials');
  }

  if (options.isProd && parsed.port) {
    const allowedPorts = options.allowedPortsInProd ?? [443, 80];
    if (!allowedPorts.includes(Number(parsed.port))) {
      throw new UnsafeExternalUrlError('URL port is not allowed');
    }
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new UnsafeExternalUrlError('URL hostname is not allowed');
  }

  if (options.allowedHostnames && !isHostnameAllowlisted(hostname, options.allowedHostnames)) {
    throw new UnsafeExternalUrlError('URL hostname is not allowlisted');
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      throw new UnsafeExternalUrlError('URL must resolve to a public address');
    }
    return { url: parsed, address: hostname, family: net.isIP(hostname) as 4 | 6 };
  }

  let resolved;
  try {
    resolved = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (_err) {
    throw new UnsafeExternalUrlError('Failed to resolve URL hostname');
  }

  if (resolved.length === 0) {
    throw new UnsafeExternalUrlError('URL did not resolve');
  }

  for (const record of resolved) {
    if (isPrivateIp(record.address)) {
      throw new UnsafeExternalUrlError('URL must resolve to a public address');
    }
  }

  const selected = resolved[0]!;
  return { url: parsed, address: selected.address, family: selected.family as 4 | 6 };
};

