/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import assert from "assert";
import { parseIpv4, parseIpv6, parseCidr, matchesSingleCidr, matchesIpBlock } from "../cidr";

describe("CIDR Network Engine", () => {
  describe("IPv4 Parsing and Matching", () => {
    it("parses valid IPv4 correctly", () => {
      expect(parseIpv4("0.0.0.0")).toBe(0);
      expect(parseIpv4("255.255.255.255")).toBe(4294967295);
      expect(parseIpv4("192.168.1.1")).toBe(3232235777);
    });

    it("returns null on invalid IPv4 strings", () => {
      expect(parseIpv4("256.0.0.1")).toBeNull();
      expect(parseIpv4("1.2.3")).toBeNull();
      expect(parseIpv4("1.2.3.4.5")).toBeNull();
      expect(parseIpv4("abc.def.ghi.jkl")).toBeNull();
      expect(parseIpv4("")).toBeNull();
    });

    it("matches IPv4 in /24 range", () => {
      const cidr = parseCidr("192.168.1.0/24");

      assert(cidr);
      expect(matchesSingleCidr("192.168.1.1", cidr)).toBe(true);
      expect(matchesSingleCidr("192.168.1.254", cidr)).toBe(true);
      expect(matchesSingleCidr("192.168.2.1", cidr)).toBe(false);
    });

    it("matches /0 as catch-all", () => {
      const cidr = parseCidr("0.0.0.0/0");

      assert(cidr);
      expect(matchesSingleCidr("10.0.0.1", cidr)).toBe(true);
      expect(matchesSingleCidr("172.16.5.4", cidr)).toBe(true);
      expect(matchesSingleCidr("192.168.100.200", cidr)).toBe(true);
    });

    it("matches /32 as exact host", () => {
      const cidr = parseCidr("10.10.10.10/32");

      assert(cidr);
      expect(matchesSingleCidr("10.10.10.10", cidr)).toBe(true);
      expect(matchesSingleCidr("10.10.10.11", cidr)).toBe(false);
    });
  });

  describe("IPv6 Parsing and Matching", () => {
    it("parses valid IPv6 representations", () => {
      expect(parseIpv6("::1")).toEqual(BigInt(1));
      expect(parseIpv6("2001:db8::1")).not.toBeNull();
      expect(parseIpv6("fe80::1")).not.toBeNull();
    });

    it("returns null for malformed IPv6", () => {
      expect(parseIpv6("2001:::1")).toBeNull();
      expect(parseIpv6("2001:xyz::1")).toBeNull();
      expect(parseIpv6("")).toBeNull();
    });

    it("matches IPv6 in /64 subnet", () => {
      const cidr = parseCidr("2001:db8:abcd:0012::/64");

      assert(cidr);
      expect(matchesSingleCidr("2001:db8:abcd:0012::1", cidr)).toBe(true);
      expect(matchesSingleCidr("2001:db8:abcd:0012:ffff:ffff:ffff:ffff", cidr)).toBe(true);
      expect(matchesSingleCidr("2001:db8:abcd:0013::1", cidr)).toBe(false);
    });

    it("matches IPv6 /0 as catch-all", () => {
      const cidr = parseCidr("::/0");

      assert(cidr);
      expect(matchesSingleCidr("fe80::1", cidr)).toBe(true);
      expect(matchesSingleCidr("2001:db8::1", cidr)).toBe(true);
    });
  });

  describe("ipBlock with except exclusions", () => {
    it("correctly excludes addresses inside except CIDR", () => {
      const rule = {
        cidr: "10.0.0.0/8",
        except: ["10.1.0.0/16", "10.2.0.0/16"],
      };

      expect(matchesIpBlock("10.0.1.5", rule)).toBe(true);
      expect(matchesIpBlock("10.1.5.5", rule)).toBe(false); // in first except
      expect(matchesIpBlock("10.2.10.20", rule)).toBe(false); // in second except
      expect(matchesIpBlock("10.3.0.1", rule)).toBe(true); // not in except
      expect(matchesIpBlock("192.168.1.1", rule)).toBe(false); // not in main cidr
    });

    it("handles IPv6 except blocks", () => {
      const rule = {
        cidr: "2001:db8::/32",
        except: ["2001:db8:1::/48"],
      };

      expect(matchesIpBlock("2001:db8:2::1", rule)).toBe(true);
      expect(matchesIpBlock("2001:db8:1::5", rule)).toBe(false);
      expect(matchesIpBlock("fe80::1", rule)).toBe(false);
    });
  });
});
