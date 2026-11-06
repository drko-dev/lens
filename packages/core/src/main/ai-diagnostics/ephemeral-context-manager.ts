/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import crypto from "crypto";
import path from "path";
import {
  ALLOWED_FILE_EXTENSIONS,
  EPHEMERAL_CONTEXT_LIMITS,
  FORBIDDEN_FILE_EXTENSIONS,
  type AddEphemeralFileInput,
  type EphemeralDeclaredMetadata,
  type EphemeralFileDescriptor,
  type EphemeralFileType,
  type EphemeralSanitizedContext,
  type UpdateEphemeralMetadataInput,
} from "../../common/incident/ephemeral-context-types";
import { EvidenceSanitizer } from "../incident-storage/evidence-sanitizer";

export class EphemeralContextSecurityError extends Error {
  constructor(public readonly code: string, message: string) {
    super(`[EphemeralContext:${code}] ${message}`);
    this.name = "EphemeralContextSecurityError";
  }
}

interface EphemeralInternalRecord {
  descriptor: EphemeralFileDescriptor;
  rawBuffer: Buffer;
  sanitizedContent: string;
}

export class EphemeralContextManager {
  // Main-process memory-only storage: Map<incidentId, Map<fileId, EphemeralInternalRecord>>
  private readonly storage = new Map<string, Map<string, EphemeralInternalRecord>>();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options?: { enableAutoCleanup?: boolean }) {
    if (options?.enableAutoCleanup !== false) {
      this.startAutoCleanup();
    }
  }

  public dispose(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
    this.clearAll();
  }

  private startAutoCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.sweepExpiredFiles();
    }, 60 * 1000);

    // Unref so timer does not prevent process exit
    if (typeof this.cleanupInterval.unref === "function") {
      this.cleanupInterval.unref();
    }
  }

  private sweepExpiredFiles(): void {
    const now = Date.now();
    for (const [incidentId, fileMap] of this.storage.entries()) {
      for (const [fileId, record] of fileMap.entries()) {
        if (now > record.descriptor.expiresAt) {
          this.destroyRecord(record);
          fileMap.delete(fileId);
        }
      }
      if (fileMap.size === 0) {
        this.storage.delete(incidentId);
      }
    }
  }

  private destroyRecord(record: EphemeralInternalRecord): void {
    try {
      if (record.rawBuffer && Buffer.isBuffer(record.rawBuffer)) {
        record.rawBuffer.fill(0);
      }
    } catch {
      // Ignore if already freed or read-only
    }
    // H84-SEC-02: Zero out and void sanitized content reference
    // JavaScript strings are immutable in V8; dropping references immediately orphans
    // the allocated string to be collected by the V8 garbage collector.
    record.sanitizedContent = "";
    record.descriptor.isPurged = true;
  }

  public classifyFileType(filename: string, content: string): EphemeralFileType {
    const lowerName = filename.toLowerCase();
    const baseName = path.basename(lowerName);

    if (baseName === "dockerfile" || baseName.startsWith("dockerfile.") || lowerName.endsWith(".dockerfile")) {
      return "dockerfile";
    }

    if (baseName === "values.yaml" || baseName === "values.yml" || baseName.startsWith("values-")) {
      return "helm_values";
    }

    // Kubernetes manifest detection
    if ((lowerName.endsWith(".yaml") || lowerName.endsWith(".yml")) && /^\s*apiVersion\s*:\s*[^\s]+/m.test(content)) {
      if (/^\s*kind\s*:\s*ConfigMap/mi.test(content)) {
        return "config_map";
      }
      return "k8s_manifest";
    }

    if (lowerName.endsWith(".conf") || lowerName.endsWith(".properties") || lowerName.endsWith(".toml") || lowerName.endsWith(".ini")) {
      return "config_file";
    }

    return "text_doc";
  }

  public validateFilename(rawFilename: string): string {
    if (!rawFilename || typeof rawFilename !== "string" || rawFilename.trim().length === 0) {
      throw new EphemeralContextSecurityError("INVALID_FILENAME", "El nombre de archivo no puede estar vacío.");
    }

    // Path traversal check
    if (rawFilename.includes("/") || rawFilename.includes("\\") || rawFilename.includes("..")) {
      throw new EphemeralContextSecurityError(
        "PATH_TRAVERSAL_DETECTED",
        "El nombre de archivo no puede contener separadores de ruta ni secuencias '..'.",
      );
    }

    const cleanName = path.basename(rawFilename.trim());
    if (cleanName.length > 255) {
      throw new EphemeralContextSecurityError("FILENAME_TOO_LONG", "El nombre de archivo supera el límite de 255 caracteres.");
    }

    const lower = cleanName.toLowerCase();

    // Check forbidden extensions
    for (const ext of FORBIDDEN_FILE_EXTENSIONS) {
      if (lower.endsWith(ext)) {
        throw new EphemeralContextSecurityError(
          "FORBIDDEN_FILE_TYPE",
          `El tipo de archivo con extensión '${ext}' está estrictamente prohibido por políticas de seguridad.`,
        );
      }
    }

    // Allow Dockerfile without extension
    if (lower === "dockerfile" || lower.startsWith("dockerfile.")) {
      return cleanName;
    }

    // Check allowed extensions
    const hasAllowedExt = ALLOWED_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
    if (!hasAllowedExt) {
      throw new EphemeralContextSecurityError(
        "UNSUPPORTED_FILE_EXTENSION",
        `La extensión del archivo '${cleanName}' no está en la lista de formatos permitidos (${ALLOWED_FILE_EXTENSIONS.join(", ")}).`,
      );
    }

    return cleanName;
  }

  public validateContentSecurity(content: string, buffer: Buffer): void {
    // 1. Binary / NUL byte detection
    if (buffer.includes(0x00)) {
      throw new EphemeralContextSecurityError(
        "BINARY_FILE_FORBIDDEN",
        "El archivo contiene caracteres binarios o NUL bytes. Solo se admiten archivos de texto estructurado.",
      );
    }

    // 2. Executable magic bytes check
    if (buffer.length >= 4) {
      // ELF: 0x7F 'E' 'L' 'F'
      if (buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
        throw new EphemeralContextSecurityError("EXECUTABLE_BINARY_FORBIDDEN", "Binario ejecutable ELF detectado y bloqueado.");
      }
      // Mach-O
      if (
        (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)) ||
        (buffer[0] === 0xcf && buffer[1] === 0xfa && buffer[2] === 0xed && buffer[3] === 0xfe) ||
        (buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe)
      ) {
        throw new EphemeralContextSecurityError("EXECUTABLE_BINARY_FORBIDDEN", "Binario ejecutable Mach-O detectado y bloqueado.");
      }
      // Windows PE: 'MZ'
      if (buffer[0] === 0x4d && buffer[1] === 0x5a) {
        throw new EphemeralContextSecurityError("EXECUTABLE_BINARY_FORBIDDEN", "Binario ejecutable PE detectado y bloqueado.");
      }
    }

    // 3. Prohibit Kubernetes Secret resources
    if (/^\s*kind\s*:\s*["']?Secret["']?/mi.test(content)) {
      throw new EphemeralContextSecurityError(
        "SECRET_RESOURCE_FORBIDDEN",
        "Los manifiestos de tipo Kubernetes Secret están prohibidos por defecto en el contexto manual.",
      );
    }
  }

  public async addFile(incidentId: string, input: AddEphemeralFileInput): Promise<EphemeralFileDescriptor> {
    if (!incidentId || typeof incidentId !== "string") {
      throw new EphemeralContextSecurityError("INVALID_INCIDENT_ID", "incidentId es obligatorio.");
    }

    if (!input.rawContent || typeof input.rawContent !== "string") {
      throw new EphemeralContextSecurityError("EMPTY_CONTENT", "El contenido del archivo no puede estar vacío.");
    }

    const cleanFilename = this.validateFilename(input.filename);
    const contentBuffer = Buffer.from(input.rawContent, "utf8");
    const byteLength = contentBuffer.byteLength;

    if (byteLength > EPHEMERAL_CONTEXT_LIMITS.maxBytesPerFile) {
      throw new EphemeralContextSecurityError(
        "FILE_SIZE_EXCEEDED",
        `El tamaño del archivo (${byteLength} bytes) supera el límite máximo permitido de ${EPHEMERAL_CONTEXT_LIMITS.maxBytesPerFile} bytes (64 KiB).`,
      );
    }

    this.validateContentSecurity(input.rawContent, contentBuffer);

    // Apply strict sanitization (redacting tokens, JWTs, keys, credentials)
    const sanitizationResult = EvidenceSanitizer.sanitize(input.rawContent);
    const sanitizedContent = sanitizationResult.sanitizedContent;

    let incidentMap = this.storage.get(incidentId);
    if (!incidentMap) {
      incidentMap = new Map<string, EphemeralInternalRecord>();
      this.storage.set(incidentId, incidentMap);
    }

    // Check file count limit (if not replacing existing with same name)
    const existingEntry = Array.from(incidentMap.entries()).find(
      ([_, rec]) => rec.descriptor.filename.toLowerCase() === cleanFilename.toLowerCase(),
    );

    if (!existingEntry && incidentMap.size >= EPHEMERAL_CONTEXT_LIMITS.maxFilesPerIncident) {
      throw new EphemeralContextSecurityError(
        "MAX_FILES_EXCEEDED",
        `Se ha alcanzado el límite máximo de ${EPHEMERAL_CONTEXT_LIMITS.maxFilesPerIncident} archivos de contexto para este caso.`,
      );
    }

    // Calculate total accumulated bytes
    let currentTotalBytes = 0;
    for (const [id, rec] of incidentMap.entries()) {
      if (!existingEntry || id !== existingEntry[0]) {
        currentTotalBytes += rec.descriptor.byteLength;
      }
    }

    if (currentTotalBytes + byteLength > EPHEMERAL_CONTEXT_LIMITS.maxTotalBytesPerIncident) {
      throw new EphemeralContextSecurityError(
        "TOTAL_SIZE_EXCEEDED",
        `El tamaño acumulado de contexto manual (${currentTotalBytes + byteLength} bytes) supera el límite máximo de ${EPHEMERAL_CONTEXT_LIMITS.maxTotalBytesPerIncident} bytes (192 KiB).`,
      );
    }

    // If replacing existing file with same name, purge old record
    if (existingEntry) {
      this.destroyRecord(existingEntry[1]);
      incidentMap.delete(existingEntry[0]);
    }

    const fileId = `CTX-${crypto.randomUUID()}`;
    const detectedType = input.fileType || this.classifyFileType(cleanFilename, input.rawContent);
    const sha256Hash = crypto.createHash("sha256").update(sanitizedContent, "utf8").digest("hex");
    const now = Date.now();

    const declaredMetadata: EphemeralDeclaredMetadata = {
      environment: input.metadata?.environment || "unspecified",
      clusterId: input.metadata?.clusterId,
      namespace: input.metadata?.namespace,
      resourceKind: input.metadata?.resourceKind,
      resourceName: input.metadata?.resourceName,
      version: input.metadata?.version,
      provenance: input.metadata?.provenance || "operator-manual",
      notes: input.metadata?.notes,
    };

    const descriptor: EphemeralFileDescriptor = {
      id: fileId,
      incidentId,
      filename: cleanFilename,
      fileType: detectedType,
      byteLength,
      sha256Hash,
      redactedFindingsCount: sanitizationResult.redactionsCount,
      metadata: declaredMetadata,
      addedAt: new Date(now).toISOString(),
      expiresAt: now + EPHEMERAL_CONTEXT_LIMITS.ttlMs,
      isPurged: false,
    };

    incidentMap.set(fileId, {
      descriptor,
      rawBuffer: contentBuffer,
      sanitizedContent,
    });

    return descriptor;
  }

  public updateMetadata(input: UpdateEphemeralMetadataInput): EphemeralFileDescriptor {
    const incidentMap = this.storage.get(input.incidentId);
    if (!incidentMap) {
      throw new EphemeralContextSecurityError("INCIDENT_CONTEXT_NOT_FOUND", "No hay contexto para el incidente indicado.");
    }

    const record = incidentMap.get(input.fileId);
    if (!record) {
      throw new EphemeralContextSecurityError("FILE_NOT_FOUND", `Archivo con ID '${input.fileId}' no encontrado.`);
    }

    if (record.descriptor.isPurged) {
      throw new EphemeralContextSecurityError("FILE_PURGED", "No se pueden actualizar metadatos de un archivo purgado o invalidado.");
    }

    record.descriptor.metadata = {
      ...record.descriptor.metadata,
      ...input.metadata,
    };

    // Refresh TTL on user update
    record.descriptor.expiresAt = Date.now() + EPHEMERAL_CONTEXT_LIMITS.ttlMs;

    return { ...record.descriptor };
  }

  public removeFile(incidentId: string, fileId: string): boolean {
    const incidentMap = this.storage.get(incidentId);
    if (!incidentMap) return false;

    const record = incidentMap.get(fileId);
    if (!record) return false;

    this.destroyRecord(record);
    incidentMap.delete(fileId);

    if (incidentMap.size === 0) {
      this.storage.delete(incidentId);
    }

    return true;
  }

  public clearIncidentContext(incidentId: string): void {
    const incidentMap = this.storage.get(incidentId);
    if (incidentMap) {
      for (const record of incidentMap.values()) {
        this.destroyRecord(record);
      }
      incidentMap.clear();
      this.storage.delete(incidentId);
    }
  }

  public clearAll(): void {
    for (const incidentMap of this.storage.values()) {
      for (const record of incidentMap.values()) {
        this.destroyRecord(record);
      }
      incidentMap.clear();
    }
    this.storage.clear();
  }

  /**
   * Securely zeroes the raw Buffer in RAM post-diagnosis or post-cancellation,
   * while keeping sanitized metadata active until explicitly removed or expired.
   */
  public purgeRawBuffers(incidentId: string): void {
    const incidentMap = this.storage.get(incidentId);
    if (incidentMap) {
      for (const record of incidentMap.values()) {
        this.destroyRecord(record);
        record.descriptor.isPurged = true;
      }
    }
  }

  public listFiles(incidentId: string): EphemeralFileDescriptor[] {
    const incidentMap = this.storage.get(incidentId);
    if (!incidentMap) return [];

    return Array.from(incidentMap.values()).map(r => ({ ...r.descriptor }));
  }

  public getFilesForDiagnosis(incidentId: string): EphemeralSanitizedContext[] {
    const incidentMap = this.storage.get(incidentId);
    if (!incidentMap) return [];

    const now = Date.now();
    return Array.from(incidentMap.values())
      .filter(r => !r.descriptor.isPurged && now <= r.descriptor.expiresAt && r.sanitizedContent.length > 0)
      .map(r => ({
        id: r.descriptor.id,
        filename: r.descriptor.filename,
        fileType: r.descriptor.fileType,
        sha256Hash: r.descriptor.sha256Hash,
        sanitizedContent: r.sanitizedContent,
        metadata: { ...r.descriptor.metadata },
      }));
  }

  /**
   * Deterministic SHA-256 fingerprint over all active manual files in an incident.
   * Sealed into the ephemeral consent token (Anti-Tamper requirement).
   * H84-SEC-01: Canonical, comprehensive serialization of all declared metadata and sanitized contents.
   */
  public computeContextFingerprint(incidentId: string): {
    hash: string;
    fileIds: string[];
    totalBytes: number;
    count: number;
  } {
    const incidentMap = this.storage.get(incidentId);
    if (!incidentMap || incidentMap.size === 0) {
      return { hash: "", fileIds: [], totalBytes: 0, count: 0 };
    }

    const now = Date.now();
    const activeRecords = Array.from(incidentMap.values())
      .filter(r => !r.descriptor.isPurged && now <= r.descriptor.expiresAt && r.sanitizedContent.length > 0)
      .sort((a, b) => a.descriptor.id.localeCompare(b.descriptor.id));

    if (activeRecords.length === 0) {
      return { hash: "", fileIds: [], totalBytes: 0, count: 0 };
    }

    const hasher = crypto.createHash("sha256");
    let totalBytes = 0;

    for (const rec of activeRecords) {
      totalBytes += rec.descriptor.byteLength;
      const sanitizedHash = crypto.createHash("sha256").update(rec.sanitizedContent, "utf8").digest("hex");
      const canonicalMeta = [
        rec.descriptor.id,
        rec.descriptor.filename,
        rec.descriptor.fileType,
        rec.descriptor.sha256Hash,
        sanitizedHash,
        rec.descriptor.byteLength,
        rec.descriptor.metadata.environment ?? "",
        rec.descriptor.metadata.clusterId ?? "",
        rec.descriptor.metadata.namespace ?? "",
        rec.descriptor.metadata.resourceKind ?? "",
        rec.descriptor.metadata.resourceName ?? "",
        rec.descriptor.metadata.version ?? "",
        rec.descriptor.metadata.provenance ?? "",
        rec.descriptor.metadata.notes ?? "",
      ].join("|");
      hasher.update(canonicalMeta);
    }

    return {
      hash: hasher.digest("hex"),
      fileIds: activeRecords.map(r => r.descriptor.id),
      totalBytes,
      count: activeRecords.length,
    };
  }
}
