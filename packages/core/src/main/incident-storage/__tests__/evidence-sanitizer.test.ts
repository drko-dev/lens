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
  });
});
