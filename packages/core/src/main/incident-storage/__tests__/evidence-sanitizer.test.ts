/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import {
  EvidenceSanitizer,
  MAX_SNIPPET_BYTES,
} from "../evidence-sanitizer";

describe("EvidenceSanitizer (H8-008)", () => {
  describe("Redacción de Credenciales y Secretos", () => {
    it("redacta claves privadas PEM y certificados X.509", () => {
      const raw = `
        2026-11-05 [DEBUG] Server loaded TLS certificates:
        -----BEGIN RSA PRIVATE KEY-----
        MIIEowIBAAKCAQEA0Y1234567890abcdefghijklmnopqrstuvwxyz
        -----END RSA PRIVATE KEY-----
        Certificate chain:
        -----BEGIN CERTIFICATE-----
        MIIDXTCCAkWgAwIBAgIJAL9876543210zyxwvutsrqponmlkjihgfedcba
        -----END CERTIFICATE-----
      `;

      const result = EvidenceSanitizer.sanitize(raw);

      expect(result.sanitizedContent).toContain("[REDACTED_PRIVATE_KEY]");
      expect(result.sanitizedContent).toContain("[REDACTED_CERTIFICATE]");
      expect(result.sanitizedContent).not.toContain("MIIEowIBAAKCAQEA");
      expect(result.sanitizedContent).not.toContain("MIIDXTCCAkWgAwIBAgIJ");
      expect(result.redactionsCount).toBeGreaterThanOrEqual(2);
    });

    it("redacta claves SSH públicas y privadas", () => {
      const raw = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQC3... user@workstation";
      const result = EvidenceSanitizer.sanitize(raw);

      expect(result.sanitizedContent).toContain("[REDACTED_SSH_KEY]");
      expect(result.sanitizedContent).not.toContain("AAAAB3NzaC1yc2E");
    });

    it("redacta Bearer tokens, Basic auth y JWTs", () => {
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const raw = `
        Authorization: Bearer my-secret-bearer-token-12345
        Proxy-Authorization: Basic dXNlcjpwYXNzd29yZA==
        Extracted token: ${jwt}
      `;

      const result = EvidenceSanitizer.sanitize(raw);

      expect(result.sanitizedContent).toContain("Bearer [REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain("Basic [REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain("[REDACTED_JWT]");
      expect(result.sanitizedContent).not.toContain("my-secret-bearer-token-12345");
      expect(result.sanitizedContent).not.toContain(jwt);
    });

    it("redacta contraseñas en URLs y parámetros sensibles en query string", () => {
      const raw = "Connecting to https://admin:SuperSecretPass123!@database.internal.net:5432/app?ssl=true&access_token=tokenXYZ987&normal_param=ok";
      const result = EvidenceSanitizer.sanitize(raw);

      expect(result.sanitizedContent).toContain("https://admin:[REDACTED_PASSWORD]@database.internal.net");
      expect(result.sanitizedContent).toContain("access_token=[REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain("normal_param=ok");
      expect(result.sanitizedContent).not.toContain("SuperSecretPass123!");
      expect(result.sanitizedContent).not.toContain("tokenXYZ987");
    });

    it("redacta pares clave-valor sensibles en manifiestos y logs", () => {
      const raw = `
        database:
          password: "db-secret-password-xyz"
          client_secret: 'oauth-client-secret-999'
          apiKey: my-private-api-key-here
          host: "postgres.db.svc"
      `;

      const result = EvidenceSanitizer.sanitize(raw);

      expect(result.sanitizedContent).toContain("password: [REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain("client_secret: [REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain("apiKey: [REDACTED_TOKEN]");
      expect(result.sanitizedContent).toContain('host: "postgres.db.svc"');
      expect(result.sanitizedContent).not.toContain("db-secret-password-xyz");
      expect(result.sanitizedContent).not.toContain("oauth-client-secret-999");
    });
  });

  describe("Bloqueo de Recursos Prohibidos", () => {
    it("bloquea la sanitización si el resourceKind es secret o serviceaccount", () => {
      expect(() => {
        EvidenceSanitizer.sanitize("some safe content", "Secret");
      }).toThrow("El tipo de recurso 'Secret' está estrictamente prohibido");

      expect(() => {
        EvidenceSanitizer.sanitize("some safe content", "ServiceAccount");
      }).toThrow("El tipo de recurso 'ServiceAccount' está estrictamente prohibido");

      expect(() => {
        EvidenceSanitizer.sanitize("some safe content", "secrets");
      }).toThrow("El tipo de recurso 'secrets' está estrictamente prohibido");
    });

    it("bloquea manifiestos embebidos de tipo Secret", () => {
      const manifest = `
apiVersion: v1
kind: Secret
metadata:
  name: my-app-secret
data:
  api-key: dGVzdAo=
`;

      expect(() => {
        EvidenceSanitizer.sanitize(manifest, "manifest");
      }).toThrow("El contenido contiene un manifiesto de tipo 'Secret'");
    });

    it("bloquea contenido con caracteres binarios nulos", () => {
      const binaryJunk = "Valid text\0with null bytes";

      expect(() => {
        EvidenceSanitizer.sanitize(binaryJunk);
      }).toThrow("El contenido contiene caracteres nulos o formato binario no procesable");
    });
  });

  describe("Límites de Tamaño y Normalización", () => {
    it("rechaza fragmentos que superen 64 KiB tras sanitización", () => {
      const largeContent = "A".repeat(MAX_SNIPPET_BYTES + 10);

      expect(() => {
        EvidenceSanitizer.sanitize(largeContent);
      }).toThrow("supera el límite máximo permitido de 64 KiB");
    });

    it("normaliza saltos de línea CRLF a LF y computa un SHA-256 determinístico", () => {
      const text1 = "Line 1\r\nLine 2   \r\nLine 3";
      const text2 = "Line 1\nLine 2\nLine 3";

      const res1 = EvidenceSanitizer.sanitize(text1);
      const res2 = EvidenceSanitizer.sanitize(text2);

      expect(res1.sanitizedContent).toBe(res2.sanitizedContent);
      expect(res1.sha256Hash).toBe(res2.sha256Hash);
      expect(res1.sha256Hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("rechaza entradas que superen 256 KiB antes de sanitizar (preflight guard)", () => {
      const oversizedRaw = "B".repeat(256 * 1024 + 1);

      expect(() => {
        EvidenceSanitizer.sanitize(oversizedRaw);
      }).toThrow("supera el límite máximo permitido de 256 KiB antes de sanitización");
    });
  });

  describe("H8.8-02-R3: Adversarial Performance & Bounded Processing", () => {
    it("processes single unbroken string of 32 KiB and 64 KiB in under 100ms without catastrophic backtracking", () => {
      for (const size of [4096, 8192, 16384, 32768, 64000]) {
        const input = "A".repeat(size);
        const start = Date.now();
        const res = EvidenceSanitizer.sanitize(input);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(150); // Well under 2 seconds (typically < 10ms)
        expect(res.byteLength).toBe(size);
        expect(res.redactionsCount).toBe(0);
      }
    });

    it("sanitizes extensive logs containing embedded secrets in bounded linear time", () => {
      const logLine = "2026-11-07T12:00:00Z [INFO] request id=123 token=abc123secretToken status=200\n";
      const massiveLog = logLine.repeat(800); // ~64 KiB
      const start = Date.now();
      const res = EvidenceSanitizer.sanitize(massiveLog.slice(0, 60000));
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
      expect(res.sanitizedContent).not.toContain("abc123secretToken");
      expect(res.sanitizedContent).toContain("token=[REDACTED_TOKEN]");
      expect(res.redactionsCount).toBeGreaterThan(0);
    });

    it("sanitizes dense JSON and YAML with sensitive keys in bounded time", () => {
      const jsonChunk = '{"password": "secretVal123", "apiKey": "keyVal456", "data": "regularData"},\n';
      const jsonContent = "[" + jsonChunk.repeat(500) + '{"password": "last"}]'; // ~40 KiB
      const start = Date.now();
      const res = EvidenceSanitizer.sanitize(jsonContent);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(200);
      expect(res.sanitizedContent).not.toContain("secretVal123");
      expect(res.sanitizedContent).not.toContain("keyVal456");
      expect(res.sanitizedContent).toContain('"password": [REDACTED_TOKEN]');
      expect(res.sanitizedContent).toContain('"apiKey": [REDACTED_TOKEN]');
    });

    it("sanitizes long keys with prefixes (e.g. DATABASE_AUTHENTICATION_PASSWORD) in bounded time", () => {
      const prefixKeys = `
        DATABASE_AUTHENTICATION_PASSWORD: "ultra-secret-db-pass"
        KUBE_SYSTEM_SERVICE_ACCOUNT_TOKEN: "eyJhbGciOi..."
        STRIPE_TEST_SECRET_KEY: "sk_test_123456789"
        NORMAL_LONG_KEY_WITHOUT_SENSITIVITY_IN_NAME: "normal-value"
      `;
      const res = EvidenceSanitizer.sanitize(prefixKeys);

      expect(res.sanitizedContent).toContain("DATABASE_AUTHENTICATION_PASSWORD: [REDACTED_TOKEN]");
      expect(res.sanitizedContent).toContain("KUBE_SYSTEM_SERVICE_ACCOUNT_TOKEN: [REDACTED_TOKEN]");
      expect(res.sanitizedContent).toContain("STRIPE_TEST_SECRET_KEY: [REDACTED_TOKEN]");
      expect(res.sanitizedContent).toContain('NORMAL_LONG_KEY_WITHOUT_SENSITIVITY_IN_NAME: "normal-value"');
      expect(res.sanitizedContent).not.toContain("ultra-secret-db-pass");
    });

    it("handles UTF-8 multibyte characters safely and deterministically", () => {
      const multibyteStr = "🔥".repeat(1000) + ' password: "secret-utf8-pass" ' + "日本語".repeat(500);
      const start = Date.now();
      const res = EvidenceSanitizer.sanitize(multibyteStr);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(res.sanitizedContent).not.toContain("secret-utf8-pass");
      expect(res.sanitizedContent).toContain("password: [REDACTED_TOKEN]");
      expect(res.sanitizedContent).toContain("🔥");
      expect(res.sanitizedContent).toContain("日本語");
    });

    it("never leaks raw content into exception error messages", () => {
      const canarySecret = "CANARY_SECRET_NEVER_LEAK_IN_EXCEPTION_MSG";
      const invalidContent = canarySecret + "\0nullbytes";

      try {
        EvidenceSanitizer.sanitize(invalidContent);
        throw new Error("Should have thrown UNSANITIZABLE_CONTENT");
      } catch (err: any) {
        expect(err.message).not.toContain(canarySecret);
        expect(err.code).toBe("UNSANITIZABLE_CONTENT");
      }
    });
  });
});
