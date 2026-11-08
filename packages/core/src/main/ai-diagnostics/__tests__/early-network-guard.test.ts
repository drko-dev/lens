/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import net from "node:net";
import tls from "node:tls";
import path from "node:path";

// Require the early network guard CJS module directly
const guardPath = path.resolve(__dirname, "../../../../../../open-lens/integration/early-network-guard.cjs");
const { isAllowedLoopbackOrInternalHost, strictLoopbackLookup } = require(guardPath);

describe("EarlyNetworkGuard: Loopback Enforcement & Network Isolation (H8.8-05-R3)", () => {
  describe("1. Hostname & IP Filtering (isAllowedLoopbackOrInternalHost)", () => {
    it("permits legitimate loopback IPv4 addresses (127.0.0.0/8 block)", () => {
      expect(isAllowedLoopbackOrInternalHost("127.0.0.1")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("127.0.0.2")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("127.255.255.254")).toBe(true);
    });

    it("permits legitimate loopback IPv6 addresses", () => {
      expect(isAllowedLoopbackOrInternalHost("::1")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("0:0:0:0:0:0:0:1")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("::ffff:127.0.0.1")).toBe(true);
    });

    it("permits exact 'localhost' and 'lens.app'", () => {
      expect(isAllowedLoopbackOrInternalHost("localhost")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("LOCALHOST")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("lens.app")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("LENS.APP")).toBe(true);
    });

    it("permits legitimate internal cluster hosts with pattern <cluster-id>.lens.app", () => {
      expect(isAllowedLoopbackOrInternalHost("openlens-demo-cluster-local.lens.app")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("c-prod-aws-123.lens.app")).toBe(true);
      expect(isAllowedLoopbackOrInternalHost("sim_cluster_alpha.lens.app")).toBe(true);
    });

    it("strictly blocks external public IPv4 addresses", () => {
      expect(isAllowedLoopbackOrInternalHost("8.8.8.8")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("1.1.1.1")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("93.184.216.34")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("169.254.169.254")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("0.0.0.0")).toBe(false);
    });

    it("strictly blocks private RFC1918 non-loopback IPs", () => {
      expect(isAllowedLoopbackOrInternalHost("192.168.1.1")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("10.0.0.1")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("172.16.0.1")).toBe(false);
    });

    it("strictly blocks non-loopback IPv6 addresses", () => {
      expect(isAllowedLoopbackOrInternalHost("fe80::1")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("2001:4860:4860::8888")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("::")).toBe(false);
    });

    it("blocks domains with fake suffix or subdomains attempting to bypass .lens.app", () => {
      expect(isAllowedLoopbackOrInternalHost("evil.lens.app.attacker.com")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("lens.app.evil.com")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("notlens.app")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("evillens.app")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost(".lens.app")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("fake.sub.cluster.lens.app")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost("attacker-lens.app")).toBe(false);
    });

    it("blocks invalid/empty host inputs fail-closed", () => {
      expect(isAllowedLoopbackOrInternalHost("")).toBe(false);
      expect(isAllowedLoopbackOrInternalHost(null as any)).toBe(false);
      expect(isAllowedLoopbackOrInternalHost(undefined as any)).toBe(false);
    });
  });

  describe("2. Strict Loopback DNS Resolution (strictLoopbackLookup)", () => {
    it("resolves verified internal hostnames strictly to 127.0.0.1 without network lookup", (done) => {
      strictLoopbackLookup("lens.app", {}, (err: Error | null, address?: string, family?: number) => {
        expect(err).toBeNull();
        expect(address).toBe("127.0.0.1");
        expect(family).toBe(4);
        done();
      });
    });

    it("resolves verified cluster-frame hostnames to 127.0.0.1", (done) => {
      strictLoopbackLookup("openlens-demo-cluster-local.lens.app", {}, (err: Error | null, address?: string, family?: number) => {
        expect(err).toBeNull();
        expect(address).toBe("127.0.0.1");
        expect(family).toBe(4);
        done();
      });
    });

    it("rejects resolution for unauthorized external hostnames with ERR_NETWORK_POLICY_BLOCKED", (done) => {
      strictLoopbackLookup("google.com", {}, (err: any) => {
        expect(err).toBeDefined();
        expect(err.code).toBe("ERR_NETWORK_POLICY_BLOCKED");
        done();
      });
    });

    it("rejects resolution for fake suffix domains", (done) => {
      strictLoopbackLookup("evil.lens.app.attacker.com", {}, (err: any) => {
        expect(err).toBeDefined();
        expect(err.code).toBe("ERR_NETWORK_POLICY_BLOCKED");
        done();
      });
    });
  });

  describe("3. Node Socket & TLS Interception", () => {
    let localServer: net.Server;
    let localPort: number;

    beforeAll((done) => {
      localServer = net.createServer((socket) => {
        socket.write("PONG\n");
        socket.end();
      });
      localServer.listen(0, "127.0.0.1", () => {
        localPort = (localServer.address() as net.AddressInfo).port;
        done();
      });
    });

    afterAll((done) => {
      localServer.close(done);
    });

    it("allows socket connection to verified local loopback server", (done) => {
      const client = net.connect({ host: "127.0.0.1", port: localPort }, () => {
        client.on("data", (data) => {
          expect(data.toString()).toContain("PONG");
          client.end();
          done();
        });
      });
      client.on("error", (err) => done(err));
    });

    it("blocks outgoing socket connection to external public IP fail-closed", (done) => {
      const client = net.connect({ host: "8.8.8.8", port: 53 });
      client.on("error", (err: any) => {
        expect(err.code).toBe("ERR_NETWORK_POLICY_BLOCKED");
        expect(err.message).toContain("NETWORK_POLICY_BLOCKED");
        done();
      });
    });

    it("blocks outgoing socket connection to fake domain with .lens.app suffix", (done) => {
      const client = net.connect({ host: "evil.lens.app.attacker.com", port: 443 });
      client.on("error", (err: any) => {
        expect(err.code).toBe("ERR_NETWORK_POLICY_BLOCKED");
        done();
      });
    });

    it("blocks outgoing TLS connection to unauthorized target", (done) => {
      const socket = tls.connect({ host: "api.deepseek.com", port: 443 });
      socket.on("error", (err: any) => {
        expect(err.code).toBe("ERR_NETWORK_POLICY_BLOCKED");
        done();
      });
    });
  });
});
