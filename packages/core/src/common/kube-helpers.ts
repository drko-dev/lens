/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { KubeConfig } from "@kubernetes/client-node";
import yaml from "js-yaml";
import type { Cluster, Context, User } from "@kubernetes/client-node/dist/config_types";
import { ActionOnInvalid, newClusters, newContexts, newUsers } from "@kubernetes/client-node/dist/config_types";
import { isDefined, isObject } from "@openlens/utilities";
import Joi from "joi";
import type { PartialDeep } from "type-fest";

export interface KubeConfigExecEnvVar {
  name: string;
  value: string;
}

export interface KubeConfigExec {
  apiVersion?: string;
  command: string;
  args?: string[];
  env?: KubeConfigExecEnvVar[] | null;
  interactiveMode?: "Never" | "IfAvailable" | "Always";
  provideClusterInfo?: boolean;
  installHint?: string;
  [key: string]: unknown;
}

export interface ExtendedCluster extends Cluster {
  proxyUrl?: string;
  "proxy-url"?: string;
  disableCompression?: boolean;
  "disable-compression"?: boolean;
  "tls-server-name"?: string;
  extensions?: unknown[];
}

export interface ExtendedUser extends User {
  exec?: KubeConfigExec;
  tokenFile?: string;
  "token-file"?: string;
  hasInlineToken?: boolean;
  as?: string;
  "as-uid"?: string;
  "as-groups"?: string[];
  "as-user-extra"?: Record<string, string[]>;
  extensions?: unknown[];
}

export interface ExtendedContext extends Context {
  extensions?: unknown[];
}

export interface SanitizedValidationDetail {
  path: (string | number)[];
  type: string;
  message: string;
}

const SENSITIVE_KEY_PATTERN = /(token|password|secret|key|cert|ca|credential|auth|env)/i;
const VALID_INTERACTIVE_MODES = new Set(["Never", "IfAvailable", "Always"]);
const VALID_PROXY_PROTOCOLS = new Set(["http:", "https:", "socks:", "socks4:", "socks4a:", "socks5:", "socks5h:"]);

const clusterSchema = Joi.object({
  name: Joi
    .string()
    .min(1)
    .required(),
  cluster: Joi
    .object({
      server: Joi
        .string()
        .min(1)
        .required(),
      "tls-server-name": Joi
        .string()
        .min(1)
        .optional(),
      "proxy-url": Joi
        .string()
        .min(1)
        .optional(),
      "disable-compression": Joi
        .boolean()
        .optional(),
    })
    .required()
    .unknown(true),
}).unknown(true);

const userSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .required(),
  user: Joi.object()
    .optional()
    .unknown(true),
}).unknown(true);

const contextSchema = Joi.object({
  name: Joi.string()
    .min(1)
    .required(),
  context: Joi.object({
    cluster: Joi.string()
      .min(1)
      .required(),
    user: Joi.string()
      .min(1)
      .optional(),
    namespace: Joi.string()
      .optional()
      .allow(""),
  })
    .required()
    .unknown(true),
}).unknown(true);

const kubeConfigSchema = Joi.object({
  users: Joi
    .array()
    .items(userSchema)
    .optional(),
  clusters: Joi
    .array()
    .items(clusterSchema)
    .optional(),
  contexts: Joi
    .array()
    .items(contextSchema)
    .optional(),
  "current-context": Joi
    .string()
    .min(1)
    .optional(),
})
  .required();

interface KubeConfigOptions {
  clusters: ExtendedCluster[];
  users: ExtendedUser[];
  contexts: ExtendedContext[];
  currentContext: string;
}

interface OptionsResult {
  options: KubeConfigOptions;
  error: Joi.ValidationError | undefined;
}

function redactDetailMessage(message: string, path: (string | number)[]): string {
  const pathStr = path.map(String).join(".");

  if (SENSITIVE_KEY_PATTERN.test(pathStr)) {
    return `Invalid value at "${pathStr}" ([REDACTED])`;
  }

  return message;
}

export function sanitizeKubeConfigValidationDetails(error: Joi.ValidationError | undefined): SanitizedValidationDetail[] {
  if (!error || !Array.isArray(error.details)) {
    return [];
  }

  return error.details.map((detail) => ({
    path: detail.path,
    type: detail.type,
    message: redactDetailMessage(detail.message, detail.path),
  }));
}

function sanitizeValidationError(error: Joi.ValidationError | undefined): Joi.ValidationError | undefined {
  if (!error) {
    return undefined;
  }

  error._original = undefined;
  error.details = error.details.map((detail) => {
    const safeMessage = redactDetailMessage(detail.message, detail.path);
    const safeContext = detail.context
      ? {
        key: detail.context.key,
        label: detail.context.label,
      }
      : undefined;

    return {
      ...detail,
      message: safeMessage,
      context: safeContext,
    };
  });
  error.message = error.details.map((d) => d.message).join(". ");

  return error;
}

function normalizeOptional<T>(value: T | null | undefined): T | undefined {
  return value === null || value === undefined ? undefined : value;
}

function cloneExecConfig(exec: unknown): KubeConfigExec | undefined {
  if (!isObject(exec) || Array.isArray(exec)) {
    return undefined;
  }

  const rawExec = exec as Record<string, unknown>;
  const cloned: Record<string, unknown> = {
    ...rawExec,
  };

  if (Array.isArray(rawExec.args)) {
    cloned.args = [...rawExec.args];
  }

  if (Array.isArray(rawExec.env)) {
    cloned.env = rawExec.env.map((entry) => (isObject(entry) ? { ...entry } : entry));
  }

  return cloned as KubeConfigExec;
}

function loadToOptions(rawYaml: string): OptionsResult {
  const parsed = yaml.load(rawYaml);
  const { error: rawError } = kubeConfigSchema.validate(parsed, {
    abortEarly: false,
    allowUnknown: true,
  });
  const error = sanitizeValidationError(rawError);
  const { value } = kubeConfigSchema.validate(parsed, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: {
      arrays: true,
    },
  });
  const {
    clusters: rawClusters = [],
    users: rawUsers = [],
    contexts: rawContexts = [],
    "current-context": currentContext,
  } = value ?? {};

  const rawClustersByName = new Map<string, Record<string, any>>();

  if (Array.isArray(rawClusters)) {
    for (const entry of rawClusters) {
      if (isObject(entry) && typeof entry.name === "string" && isObject(entry.cluster)) {
        rawClustersByName.set(entry.name, entry.cluster as Record<string, any>);
      }
    }
  }

  const clusters: ExtendedCluster[] = newClusters(rawClusters, {
    onInvalidEntry: ActionOnInvalid.FILTER,
  }).map((cluster) => {
    const rawCluster = rawClustersByName.get(cluster.name);
    const proxyUrl = normalizeOptional<string>(rawCluster?.["proxy-url"] ?? rawCluster?.proxyUrl);
    const disableCompression = normalizeOptional<boolean>(
      rawCluster?.["disable-compression"] ?? rawCluster?.disableCompression,
    );
    const tlsServerName = normalizeOptional<string>(
      cluster.tlsServerName ?? rawCluster?.["tls-server-name"] ?? rawCluster?.tlsServerName,
    );
    const extensions = Array.isArray(rawCluster?.extensions) ? rawCluster?.extensions : undefined;

    return {
      ...cluster,
      ...(tlsServerName !== undefined ? { tlsServerName } : {}),
      ...(proxyUrl !== undefined ? { proxyUrl } : {}),
      ...(disableCompression !== undefined ? { disableCompression } : {}),
      ...(extensions !== undefined ? { extensions } : {}),
    };
  });

  const rawUsersByName = new Map<string, Record<string, any>>();
  const safeRawUsers = Array.isArray(rawUsers)
    ? rawUsers.map((entry: any) => {
      if (isObject(entry) && typeof entry.name === "string") {
        const userObj = isObject(entry.user) ? (entry.user as Record<string, any>) : {};

        rawUsersByName.set(entry.name, userObj);

        if (userObj["token-file"] && !userObj.token) {
          return {
            ...entry,
            user: {
              ...userObj,
              "token-file": undefined,
            },
          };
        }
      }

      return entry;
    })
    : [];

  const users: ExtendedUser[] = newUsers(safeRawUsers, {
    onInvalidEntry: ActionOnInvalid.FILTER,
  }).map((user) => {
    const rawUser = rawUsersByName.get(user.name) ?? {};
    const tokenFile = normalizeOptional<string>(rawUser["token-file"] ?? rawUser.tokenFile);
    const inlineToken = normalizeOptional<string>(rawUser.token);
    const exec = cloneExecConfig(rawUser.exec ?? user.exec);
    const extensions = Array.isArray(rawUser.extensions) ? rawUser.extensions : undefined;

    return {
      name: user.name,
      authProvider: normalizeOptional(user.authProvider),
      certData: normalizeOptional(user.certData),
      certFile: normalizeOptional(user.certFile),
      keyData: normalizeOptional(user.keyData),
      keyFile: normalizeOptional(user.keyFile),
      exec: (exec ?? normalizeOptional(user.exec)) as KubeConfigExec | undefined,
      token: inlineToken ?? normalizeOptional(user.token),
      ...(tokenFile !== undefined ? { tokenFile, hasInlineToken: Boolean(inlineToken) } : {}),
      username: normalizeOptional(user.username),
      password: normalizeOptional(user.password),
      ...(rawUser.as !== undefined ? { as: rawUser.as } : {}),
      ...(rawUser["as-uid"] !== undefined ? { "as-uid": rawUser["as-uid"] } : {}),
      ...(Array.isArray(rawUser["as-groups"]) ? { "as-groups": rawUser["as-groups"] } : {}),
      ...(isObject(rawUser["as-user-extra"]) ? { "as-user-extra": rawUser["as-user-extra"] as Record<string, string[]> } : {}),
      ...(extensions !== undefined ? { extensions } : {}),
    };
  });

  const rawContextsByName = new Map<string, Record<string, any>>();

  if (Array.isArray(rawContexts)) {
    for (const entry of rawContexts) {
      if (isObject(entry) && typeof entry.name === "string" && isObject(entry.context)) {
        rawContextsByName.set(entry.name, entry.context as Record<string, any>);
      }
    }
  }

  const contexts: ExtendedContext[] = newContexts(rawContexts, {
    onInvalidEntry: ActionOnInvalid.FILTER,
  }).map((ctx) => {
    const rawContext = rawContextsByName.get(ctx.name);
    const extensions = Array.isArray(rawContext?.extensions) ? rawContext?.extensions : undefined;

    return {
      ...ctx,
      ...(extensions !== undefined ? { extensions } : {}),
    };
  });

  return {
    options: { clusters, users, contexts, currentContext },
    error,
  };
}

export function loadFromOptions(options: KubeConfigOptions): KubeConfig {
  const kc = new KubeConfig();

  // need to load using the kubernetes client to generate a kubeconfig object
  kc.loadFromOptions(options);

  return kc;
}

export interface ConfigResult {
  config: KubeConfig;
  error: Joi.ValidationError | undefined;
}

export function loadConfigFromString(content: string): ConfigResult {
  const { options, error } = loadToOptions(content);

  return {
    config: loadFromOptions(options),
    error,
  };
}

export function loadValidatedConfig(content: string, contextName: string): ValidateKubeConfigResult {
  const { options, error } = loadToOptions(content);
  const validationResult = validateKubeConfig(loadFromOptions(options), contextName);

  if (validationResult.error && error) {
    return { error };
  }

  return validationResult;
}

export interface SplitConfigEntry {
  config: KubeConfig;
  validationResult: ValidateKubeConfigResult;
}

/**
 * Breaks kube config into several configs. Each context as it own KubeConfig object
 */
export function splitConfig(kubeConfig: KubeConfig): SplitConfigEntry[] {
  return kubeConfig.getContexts().map(ctx => {
    const config = new KubeConfig();
    const cluster = kubeConfig.getCluster(ctx.cluster);
    const user = kubeConfig.getUser(ctx.user);
    const context = kubeConfig.getContextObject(ctx.name);

    if (cluster) {
      config.addCluster({ ...cluster } as ExtendedCluster);
    }

    if (user) {
      const extUser = user as ExtendedUser;

      config.addUser({
        ...extUser,
        ...(extUser.exec ? { exec: cloneExecConfig(extUser.exec) } : {}),
      } as ExtendedUser);
    }

    if (context) {
      config.addContext({ ...context } as ExtendedContext);
    }

    config.setCurrentContext(ctx.name);

    return {
      config,
      validationResult: validateKubeConfig(config, ctx.name),
    };
  });
}

/**
 * Pretty format the object as human readable yaml, such as would be on the filesystem
 * @param kubeConfig The kubeconfig object to format as pretty yaml
 * @returns The yaml representation of the kubeconfig object
 */
export function dumpConfigYaml(kubeConfig: PartialDeep<KubeConfig>): string {
  const clusters = kubeConfig.clusters
    ?.filter(isDefined)
    .map(cluster => {
      const extCluster = cluster as PartialDeep<ExtendedCluster>;

      return {
        name: cluster.name,
        cluster: {
          "certificate-authority-data": normalizeOptional(cluster.caData),
          "certificate-authority": normalizeOptional(cluster.caFile),
          server: cluster.server,
          "insecure-skip-tls-verify": normalizeOptional(cluster.skipTLSVerify),
          "tls-server-name": normalizeOptional(extCluster.tlsServerName ?? extCluster["tls-server-name"]),
          "proxy-url": normalizeOptional(extCluster.proxyUrl ?? extCluster["proxy-url"]),
          "disable-compression": normalizeOptional(
            extCluster.disableCompression ?? extCluster["disable-compression"],
          ),
          extensions: normalizeOptional(extCluster.extensions),
        },
      };
    });
  const contexts = kubeConfig.contexts
    ?.filter(isDefined)
    .map(context => {
      const extContext = context as PartialDeep<ExtendedContext>;

      return {
        name: context.name,
        context: {
          cluster: context.cluster,
          user: normalizeOptional(context.user),
          namespace: normalizeOptional(context.namespace),
          extensions: normalizeOptional(extContext.extensions),
        },
      };
    });
  const users = kubeConfig.users
    ?.filter(isDefined)
    .map(user => {
      const extUser = user as PartialDeep<ExtendedUser>;
      const tokenFile = normalizeOptional(extUser.tokenFile ?? extUser["token-file"]);
      const token = tokenFile && extUser.hasInlineToken === false
        ? undefined
        : normalizeOptional(user.token);

      return {
        name: user.name,
        user: {
          "client-certificate-data": normalizeOptional(user.certData),
          "client-certificate": normalizeOptional(user.certFile),
          "client-key-data": normalizeOptional(user.keyData),
          "client-key": normalizeOptional(user.keyFile),
          "auth-provider": normalizeOptional(user.authProvider),
          exec: normalizeOptional(cloneExecConfig(user.exec)),
          token,
          "token-file": tokenFile,
          username: normalizeOptional(user.username),
          password: normalizeOptional(user.password),
          as: normalizeOptional(extUser.as),
          "as-uid": normalizeOptional(extUser["as-uid"]),
          "as-groups": normalizeOptional(extUser["as-groups"]),
          "as-user-extra": normalizeOptional(extUser["as-user-extra"]),
          extensions: normalizeOptional(extUser.extensions),
        },
      };
    });
  const config = {
    apiVersion: "v1",
    kind: "Config",
    preferences: {},
    "current-context": kubeConfig.currentContext,
    clusters,
    contexts,
    users,
  };

  // skipInvalid: true makes dump ignore undefined values
  return yaml.dump(config, { skipInvalid: true });
}

export type ValidateKubeConfigResult = {
  error: Error;
} | {
  error?: undefined;
  context: Context;
  cluster: Cluster;
  user?: User;
};

export function validateExecConfig(exec: unknown, userName: string): Error | undefined {
  if (exec === undefined || exec === null) {
    return undefined;
  }

  if (!isObject(exec) || Array.isArray(exec)) {
    return new Error(`Invalid exec configuration for user '${userName}': must be an object`);
  }

  const execObj = exec as Record<string, unknown>;

  if (typeof execObj.command !== "string" || execObj.command.trim().length === 0) {
    return new Error(`Invalid exec configuration for user '${userName}': 'command' must be a non-empty string`);
  }

  if (execObj.args !== undefined && execObj.args !== null) {
    if (!Array.isArray(execObj.args) || !execObj.args.every((arg) => typeof arg === "string")) {
      return new Error(`Invalid exec configuration for user '${userName}': 'args' must be an array of strings`);
    }
  }

  if (execObj.env !== undefined && execObj.env !== null) {
    if (
      !Array.isArray(execObj.env)
      || !execObj.env.every(
        (entry) => (
          isObject(entry)
          && typeof entry.name === "string"
          && entry.name.trim().length > 0
          && typeof entry.value === "string"
        ),
      )
    ) {
      return new Error(
        `Invalid exec configuration for user '${userName}': 'env' must be an array of { name, value } string pairs`,
      );
    }
  }

  if (
    execObj.interactiveMode !== undefined
    && execObj.interactiveMode !== null
    && (typeof execObj.interactiveMode !== "string" || !VALID_INTERACTIVE_MODES.has(execObj.interactiveMode))
  ) {
    return new Error(
      `Invalid exec configuration for user '${userName}': 'interactiveMode' must be Never, IfAvailable, or Always`,
    );
  }

  if (
    execObj.provideClusterInfo !== undefined
    && execObj.provideClusterInfo !== null
    && typeof execObj.provideClusterInfo !== "boolean"
  ) {
    return new Error(`Invalid exec configuration for user '${userName}': 'provideClusterInfo' must be a boolean`);
  }

  return undefined;
}

/**
 * Checks if `config` has valid `Context`, `User`, `Cluster`, and `exec` fields (if present when required)
 *
 * Note: This function returns an error instead of throwing it, returning `undefined` if the validation passes
 */
export function validateKubeConfig(config: KubeConfig, contextName: string): ValidateKubeConfigResult {
  const context = config.getContextObject(contextName);

  if (!context) {
    return {
      error: new Error(`No valid context object provided in kubeconfig for context '${contextName}'`),
    };
  }

  const cluster = config.getCluster(context.cluster) as ExtendedCluster | null;

  if (!cluster) {
    return {
      error: new Error(`No valid cluster object provided in kubeconfig for context '${contextName}'`),
    };
  }

  const proxyUrl = cluster.proxyUrl ?? cluster["proxy-url"];

  if (proxyUrl !== undefined) {
    try {
      const parsedProxy = new URL(proxyUrl);

      if (!VALID_PROXY_PROTOCOLS.has(parsedProxy.protocol)) {
        return {
          error: new Error(`Invalid proxy-url protocol '${parsedProxy.protocol}' in cluster '${cluster.name}'`),
        };
      }
    } catch {
      return {
        error: new Error(`Invalid proxy-url in cluster '${cluster.name}'`),
      };
    }
  }

  if (context.user) {
    const user = config.getUser(context.user);

    if (!user) {
      return {
        error: new Error(`No valid user object provided in kubeconfig for context '${contextName}'`),
      };
    }

    const execError = validateExecConfig(user.exec, user.name);

    if (execError) {
      return {
        error: execError,
      };
    }

    return { cluster, user, context };
  }

  return { cluster, context };
}
