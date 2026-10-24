/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

export interface IpBlockRule {
  cidr: string;
  except?: string[];
}

/**
 * Parses an IPv4 address string to an unsigned 32-bit number.
 * Returns null if the format is invalid.
 */
export function parseIpv4(ip: string): number | null {
  const parts = ip.trim().split(".");

  if (parts.length !== 4) {
    return null;
  }

  let num = 0;

  for (let i = 0; i < 4; i++) {
    const part = parts[i];

    if (!/^\d+$/.test(part)) {
      return null;
    }

    const byte = Number(part);

    if (byte < 0 || byte > 255) {
      return null;
    }

    num = ((num << 8) | byte) >>> 0;
  }

  return num;
}

/**
 * Parses an IPv6 address string into a 128-bit BigInt.
 * Supports standard compressed `::` notation.
 * Returns null if the format is invalid.
 */
export function parseIpv6(ip: string): bigint | null {
  const cleanIp = ip.trim().toLowerCase();

  // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:192.168.1.1)
  if (cleanIp.includes(".")) {
    const lastColon = cleanIp.lastIndexOf(":");

    if (lastColon === -1) {
      return null;
    }

    const ipv4Part = cleanIp.substring(lastColon + 1);
    const v4Num = parseIpv4(ipv4Part);

    if (v4Num === null) {
      return null;
    }

    const prefix = cleanIp.substring(0, lastColon);
    const v6Base = parseIpv6(`${prefix}:${(v4Num >>> 16).toString(16)}:${(v4Num & 0xffff).toString(16)}`);

    return v6Base;
  }

  const doubleColonCount = (cleanIp.match(/::/g) || []).length;

  if (doubleColonCount > 1) {
    return null;
  }

  let groups: string[];

  if (doubleColonCount === 1) {
    const [head, tail] = cleanIp.split("::");
    const headParts = head ? head.split(":") : [];
    const tailParts = tail ? tail.split(":") : [];
    const missing = 8 - (headParts.length + tailParts.length);

    if (missing < 1) {
      return null;
    }

    const filler = new Array(missing).fill("0");

    groups = [...headParts, ...filler, ...tailParts];
  } else {
    groups = cleanIp.split(":");

    if (groups.length !== 8) {
      return null;
    }
  }

  let result = BigInt(0);

  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }

    const val = BigInt(parseInt(group, 16));

    result = (result << BigInt(16)) | val;
  }

  return result;
}

export interface ParsedCidrV4 {
  version: 4;
  ip: number;
  mask: number;
  prefix: number;
}

export interface ParsedCidrV6 {
  version: 6;
  ip: bigint;
  mask: bigint;
  prefix: number;
}

export type ParsedCidr = ParsedCidrV4 | ParsedCidrV6;

/**
 * Parses a CIDR notation string (e.g. 192.168.1.0/24 or 2001:db8::/32).
 */
export function parseCidr(cidr: string): ParsedCidr | null {
  const [ipPart, prefixPart] = cidr.trim().split("/");

  if (!ipPart || prefixPart === undefined) {
    // If prefix is omitted, assume /32 for IPv4 and /128 for IPv6
    const v4 = parseIpv4(ipPart);

    if (v4 !== null) {
      return {
        version: 4,
        ip: v4,
        mask: 0xffffffff >>> 0,
        prefix: 32,
      };
    }

    const v6 = parseIpv6(ipPart);

    if (v6 !== null) {
      return {
        version: 6,
        ip: v6,
        mask: (BigInt(1) << BigInt(128)) - BigInt(1),
        prefix: 128,
      };
    }

    return null;
  }

  if (!/^\d+$/.test(prefixPart)) {
    return null;
  }

  const prefix = Number(prefixPart);

  const v4 = parseIpv4(ipPart);

  if (v4 !== null) {
    if (prefix < 0 || prefix > 32) {
      return null;
    }

    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;

    return {
      version: 4,
      ip: (v4 & mask) >>> 0,
      mask,
      prefix,
    };
  }

  const v6 = parseIpv6(ipPart);

  if (v6 !== null) {
    if (prefix < 0 || prefix > 128) {
      return null;
    }

    const totalBits = BigInt(128);
    const mask = prefix === 0
      ? BigInt(0)
      : ((BigInt(1) << totalBits) - BigInt(1)) ^ ((BigInt(1) << (totalBits - BigInt(prefix))) - BigInt(1));

    return {
      version: 6,
      ip: v6 & mask,
      mask,
      prefix,
    };
  }

  return null;
}

/**
 * Checks whether an IP matches a single parsed CIDR.
 */
export function matchesSingleCidr(ipStr: string, cidr: ParsedCidr): boolean {
  if (cidr.version === 4) {
    const ip = parseIpv4(ipStr);

    if (ip === null) {
      return false;
    }

    return ((ip & cidr.mask) >>> 0) === cidr.ip;
  }

  if (cidr.version === 6) {
    const ip = parseIpv6(ipStr);

    if (ip === null) {
      return false;
    }

    return (ip & cidr.mask) === cidr.ip;
  }

  return false;
}

/**
 * Checks whether an IP matches an ipBlock rule (cidr and optional except list).
 */
export function matchesIpBlock(ipStr: string, ipBlock: IpBlockRule): boolean {
  const mainCidr = parseCidr(ipBlock.cidr);

  if (!mainCidr) {
    return false;
  }

  if (!matchesSingleCidr(ipStr, mainCidr)) {
    return false;
  }

  if (ipBlock.except && ipBlock.except.length > 0) {
    for (const exceptCidrStr of ipBlock.except) {
      const exceptCidr = parseCidr(exceptCidrStr);

      if (exceptCidr && matchesSingleCidr(ipStr, exceptCidr)) {
        return false;
      }
    }
  }

  return true;
}
