/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  validateTransportEndpoint,
  validateResolvedIpAddress,
  validateRedirectTarget,
} from "../transport-security-policy";
import { SsrfSecurityViolationError } from "../ai-transport-errors";

describe("H8.8-01a: Transport Security Policy & Adversarial SSRF Suite", () => {
  describe("Protocol, Scheme & Syntax Validation", () => {
    it("authorizes valid public HTTPS endpoints", () => {
      const validEndpoints = [
        "https://api.openai.com/v1",
        "https://api.anthropic.com/v1",
        "https://generativelanguage.googleapis.com/v1beta",
        "https://my-custom-ai-gateway.example.com/api/v2",
      ];

      for (const ep of validEndpoints) {
        const result = validateTransportEndpoint(ep);
        expect(result.url.protocol).toBe("https:");
        expect(result.isSyntheticMock).toBe(false);
      }
    });

    it("authorizes synthetic mock endpoint when explicitly permitted", () => {
      const result = validateTransportEndpoint("https://synthetic-ai.local/v1");
      expect(result.isSyntheticMock).toBe(true);
      expect(result.normalizedHostname).toBe("synthetic-ai.local");
    });

    it("rejects non-HTTPS schemes (http, ftp, file, gopher)", () => {
      const invalidSchemes = [
        "http://api.openai.com/v1",
        "ftp://api.anthropic.com/v1",
        "file:///etc/passwd",
        "gopher://127.0.0.1:70",
        "ws://api.openai.com/v1",
      ];

      for (const ep of invalidSchemes) {
        expect(() => validateTransportEndpoint(ep)).toThrow(SsrfSecurityViolationError);
      }
    });

    it("rejects URLs with embedded credentials (user:password)", () => {
      const credUrls = [
        "https://admin:secret@api.openai.com/v1",
        "https://attacker:p%40ssword@api.anthropic.com/v1",
        "https://user@generativelanguage.googleapis.com/v1",
      ];

      for (const ep of credUrls) {
        expect(() => validateTransportEndpoint(ep)).toThrow(
          /embedded credentials/,
        );
      }
    });

    it("normalizes hostnames with trailing dots", () => {
      const result = validateTransportEndpoint("https://api.openai.com./v1");
      expect(result.normalizedHostname).toBe("api.openai.com");
    });

    it("blocks forbidden management and internal ports", () => {
      const forbiddenPorts = [22, 25, 80, 2375, 2379, 6443, 8080, 8443, 9090, 10250];

      for (const port of forbiddenPorts) {
        expect(() => validateTransportEndpoint(`https://api.openai.com:${port}/v1`)).toThrow(
          /Targeting forbidden port/,
        );
      }
    });
  });

  describe("Hostnames, Loopbacks & Internal Domains", () => {
    it("blocks standard loopback hostnames (localhost, 127.0.0.1, 0.0.0.0, ::1)", () => {
      const loopbacks = [
        "https://localhost/v1",
        "https://127.0.0.1/v1",
        "https://0.0.0.0/v1",
        "https://[::1]/v1",
        "https://[::]/v1",
      ];

      for (const ep of loopbacks) {
        expect(() => validateTransportEndpoint(ep)).toThrow(SsrfSecurityViolationError);
      }
    });

    it("blocks cloud instance metadata services (AWS, GCP, Azure)", () => {
      const metadataEndpoints = [
        "https://169.254.169.254/latest/meta-data/",
        "https://metadata.google.internal/computeMetadata/v1/",
        "https://metadata/computeMetadata/v1/",
        "https://[fd00:ec2::254]/latest/meta-data/",
      ];

      for (const ep of metadataEndpoints) {
        expect(() => validateTransportEndpoint(ep)).toThrow(SsrfSecurityViolationError);
      }
    });

    it("blocks internal and private domain suffixes (.internal, .local, .localhost, .onion)", () => {
      const internalDomains = [
        "https://kubernetes.default.svc.cluster.local/v1",
        "https://vault.service.internal/v1",
        "https://app.dev.localhost/v1",
        "https://hidden-service.onion/v1",
        "https://my-home-nas.local/v1",
      ];

      for (const ep of internalDomains) {
        expect(() => validateTransportEndpoint(ep)).toThrow(
          /Targeting internal or private domain/,
        );
      }
    });
  });

  describe("Alternative IP Representations & Encodings", () => {
    it("parses and blocks 32-bit integer IPv4 representations of 127.0.0.1", () => {
      // 127.0.0.1 as decimal integer: 2130706433
      expect(() => validateTransportEndpoint("https://2130706433/v1")).toThrow(
        SsrfSecurityViolationError,
      );

      // 127.0.0.1 as hex integer: 0x7f000001
      expect(() => validateTransportEndpoint("https://0x7f000001/v1")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("parses and blocks octal IPv4 representations of loopback (0177.0.0.1)", () => {
      expect(() => validateTransportEndpoint("https://0177.0.0.1/v1")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("parses and blocks mixed hex/decimal IPv4 representations (0x7f.0.0.1, 0x7f.1)", () => {
      expect(() => validateTransportEndpoint("https://0x7f.0.0.1/v1")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateTransportEndpoint("https://0x7f.1/v1")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateTransportEndpoint("https://127.1/v1")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("blocks private RFC 1918 addresses in standard and alternative formats", () => {
      // 10.0.0.1 (decimal: 167772161)
      expect(() => validateTransportEndpoint("https://10.0.0.1/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://167772161/v1")).toThrow(SsrfSecurityViolationError);

      // 192.168.1.1 (hex: 0xc0a80101)
      expect(() => validateTransportEndpoint("https://192.168.1.1/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://0xc0a80101/v1")).toThrow(SsrfSecurityViolationError);

      // 172.16.0.1 to 172.31.255.255
      expect(() => validateTransportEndpoint("https://172.16.0.1/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://172.31.255.254/v1")).toThrow(SsrfSecurityViolationError);
    });

    it("blocks link-local addresses (169.254.0.0/16)", () => {
      expect(() => validateTransportEndpoint("https://169.254.1.1/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://169.254.254.254/v1")).toThrow(SsrfSecurityViolationError);
    });

    it("blocks Carrier-Grade NAT (100.64.0.0/10)", () => {
      expect(() => validateTransportEndpoint("https://100.64.0.1/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://100.127.255.254/v1")).toThrow(SsrfSecurityViolationError);
    });
  });

  describe("IPv6 Address Blocks & IPv4-Mapped IPv6", () => {
    it("blocks IPv6 loopback [::1] and unspecified [::]", () => {
      expect(() => validateTransportEndpoint("https://[::1]/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://[::]/v1")).toThrow(SsrfSecurityViolationError);
    });

    it("blocks IPv4-mapped IPv6 loopback (::ffff:127.0.0.1)", () => {
      expect(() => validateTransportEndpoint("https://[::ffff:127.0.0.1]/v1")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateTransportEndpoint("https://[::ffff:10.0.0.1]/v1")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("blocks IPv6 link-local (fe80::/10)", () => {
      expect(() => validateTransportEndpoint("https://[fe80::1]/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://[fe80::a00:27ff:fe8e:ba8a]/v1")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("blocks IPv6 Unique Local Addresses (fc00::/7, fd00::/8)", () => {
      expect(() => validateTransportEndpoint("https://[fd00::1]/v1")).toThrow(SsrfSecurityViolationError);
      expect(() => validateTransportEndpoint("https://[fc00::abcd]/v1")).toThrow(SsrfSecurityViolationError);
    });
  });

  describe("DNS Rebinding & Connection-Time IP Verification", () => {
    it("passes verification for legitimate public IPv4 and IPv6 addresses", () => {
      expect(() => validateResolvedIpAddress("93.184.216.34")).not.toThrow();
      expect(() => validateResolvedIpAddress("142.250.190.46")).not.toThrow();
      expect(() => validateResolvedIpAddress("2606:2800:220:1:248:1893:25c8:1946")).not.toThrow();
    });

    it("blocks resolved IP pointing to loopback (DNS rebinding attempt)", () => {
      expect(() => validateResolvedIpAddress("127.0.0.1")).toThrow(
        /DNS rebinding defense/,
      );
      expect(() => validateResolvedIpAddress("::1")).toThrow(
        /DNS rebinding defense/,
      );
    });

    it("blocks resolved IP pointing to private RFC 1918 range", () => {
      expect(() => validateResolvedIpAddress("10.244.0.15")).toThrow(/DNS rebinding defense/);
      expect(() => validateResolvedIpAddress("192.168.1.50")).toThrow(/DNS rebinding defense/);
      expect(() => validateResolvedIpAddress("172.20.0.1")).toThrow(/DNS rebinding defense/);
    });

    it("blocks resolved IP pointing to cloud metadata", () => {
      expect(() => validateResolvedIpAddress("169.254.169.254")).toThrow(/DNS rebinding defense/);
    });

    it("blocks resolved IP pointing to link-local IPv6", () => {
      expect(() => validateResolvedIpAddress("fe80::1")).toThrow(/DNS rebinding defense/);
    });
  });

  describe("HTTP Redirect Validation", () => {
    const origin = "https://api.openai.com/v1/chat";

    it("permits relative and valid public HTTPS redirects", () => {
      const validTarget = validateRedirectTarget(origin, "/v1/completions");
      expect(validTarget.url.toString()).toBe("https://api.openai.com/v1/completions");

      const externalPublic = validateRedirectTarget(origin, "https://api.anthropic.com/v1/messages");
      expect(externalPublic.url.toString()).toBe("https://api.anthropic.com/v1/messages");
    });

    it("blocks redirect to insecure HTTP protocol", () => {
      expect(() => validateRedirectTarget(origin, "http://api.openai.com/v1/chat")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("blocks redirect to localhost, loopback, or metadata", () => {
      expect(() => validateRedirectTarget(origin, "http://localhost:8080/admin")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateRedirectTarget(origin, "https://127.0.0.1:8443/debug")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateRedirectTarget(origin, "https://169.254.169.254/latest/meta-data")).toThrow(
        SsrfSecurityViolationError,
      );
    });

    it("blocks redirect to internal private IPs", () => {
      expect(() => validateRedirectTarget(origin, "https://10.0.0.1/secrets")).toThrow(
        SsrfSecurityViolationError,
      );
      expect(() => validateRedirectTarget(origin, "https://192.168.1.1/router")).toThrow(
        SsrfSecurityViolationError,
      );
    });
  });
});
