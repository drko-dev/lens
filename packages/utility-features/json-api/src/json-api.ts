/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { Agent as HttpAgent } from "http";
import { Agent as HttpsAgent } from "https";
import { merge } from "lodash";
import { stringify } from "querystring";
import type { Patch } from "rfc6902";
import type { PartialDeep, ValueOf } from "type-fest";
import { EventEmitter } from "@openlens/event-emitter";
import type { Logger } from "@openlens/logger";
import type Fetch from "@openlens/node-fetch";
import type { RequestInit, Response } from "@openlens/node-fetch";
import type { Defaulted } from "@openlens/utilities";
import { isObject, isString, json } from "@openlens/utilities";

export interface JsonApiData {}

export interface JsonApiError {
  code?: number;
  message?: string;
  errors?: { id: string; title: string; status?: number }[];
}

export interface KubeJsonApiErrorCause {
  reason: string;
  message: string;
  field: string;
}

export interface KubeJsonApiErrorDetails {
  name: string;
  group: string;
  kind: string;
  causes: KubeJsonApiErrorCause[];
}

export interface KubeJsonApiError {
  kind: "Status";
  apiVersion: "v1";
  metadata: object;
  status: string;
  message: string;
  reason: string;
  details: KubeJsonApiErrorDetails;
  code: number;
}

export interface JsonApiParams<D> {
  data?: PartialDeep<D>; // request body
}

export interface JsonApiLog {
  method: string;
  reqUrl: string;
  reqInit: RequestInit;
  data?: any;
  error?: any;
}

export type GetRequestOptions = () => Promise<RequestInit>;

export interface JsonApiConfig {
  apiBase: string;
  serverAddress: string;
  debug?: boolean;
  getRequestOptions?: GetRequestOptions;
}

const httpAgent = new HttpAgent({ keepAlive: true });
const httpsAgent = new HttpsAgent({ keepAlive: true });

export type QueryParam =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | readonly number[]
  | readonly boolean[];
export type QueryParams = Partial<Record<string, QueryParam | undefined>>;

export type ParamsAndQuery<Params, Query> = ValueOf<Query> extends QueryParam
  ? Params & { query?: Query }
  : Params & { query?: undefined };

export interface JsonApiDependencies {
  fetch: typeof Fetch;
  readonly logger: Logger;
}

const parseMaybeJson = (value: unknown): unknown => {
  if (!isString(value)) {
    return value;
  }

  try {
    const parseResult = json.parse(value);

    return parseResult.callWasSuccessful ? parseResult.response : undefined;
  } catch {
    return undefined;
  }
};

const SECRET_ENDPOINT_PATTERN = /(^|\/)secrets(\/|$|\?)/;
const SECRET_DATA_PATH_PATTERN = /^\/(data|stringData)(\/|$)/;
// Not HTML: this literal is written into log payloads, never rendered.
// eslint-disable-next-line xss/no-mixed-html
const REDACTED = "<redacted>";

const collectStrings = (value: unknown): string[] => {
  if (isString(value)) {
    return value === "" ? [] : [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }

  if (isObject(value)) {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }

  return [];
};

const uniqueSortedValues = (values: string[]): string[] => [...new Set(values)].sort((a, b) => b.length - a.length);

const collectSecretValuesFromManifest = (manifest: unknown): string[] => {
  if (!isObject(manifest) || (manifest as { kind?: unknown }).kind !== "Secret") {
    return [];
  }

  return uniqueSortedValues([
    ...collectStrings((manifest as { data?: unknown }).data),
    ...collectStrings((manifest as { stringData?: unknown }).stringData),
  ]);
};

/**
 * JSON Patch operations against `/data` or `/stringData` carry Secret values
 * in `value` (and, for some strategies, `oldValue`). They must be collected so
 * the same values can be scrubbed from server error payloads.
 */
const collectSecretValuesFromPatch = (patch: unknown): string[] => {
  if (!Array.isArray(patch)) {
    return [];
  }

  return uniqueSortedValues(
    patch.flatMap((operation) => {
      if (!isObject(operation)) {
        return [];
      }

      const { path, value, oldValue } = operation as { path?: unknown; value?: unknown; oldValue?: unknown };

      if (!isString(path) || !SECRET_DATA_PATH_PATTERN.test(path)) {
        return [];
      }

      return [...collectStrings(value), ...collectStrings(oldValue)];
    }),
  );
};

const collectSecretValuesFromBody = (reqInit: unknown): string[] => {
  const parsed = isObject(reqInit) ? parseMaybeJson((reqInit as Record<string, unknown>).body) : undefined;

  return uniqueSortedValues([...collectSecretValuesFromManifest(parsed), ...collectSecretValuesFromPatch(parsed)]);
};

const scrubSecretValues = (value: unknown, secretValues: string[]): unknown => {
  if (secretValues.length === 0) {
    return value;
  }

  if (isString(value)) {
    return secretValues.reduce((acc, secretValue) => acc.split(secretValue).join(REDACTED), value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => scrubSecretValues(item, secretValues));
  }

  if (isObject(value)) {
    const clone: Record<string, unknown> = {};

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      clone[key] = scrubSecretValues(child, secretValues);
    }

    return clone;
  }

  return value;
};

/**
 * Structurally redacts every `data` / `stringData` map in a payload. This does
 * not depend on knowing the values: it works for Secret manifests, merge
 * patches and PUT bodies alike, so no Secret entry can survive by omission.
 */
const redactSecretDataMaps = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redactSecretDataMaps);
  }

  if (!isObject(value)) {
    return value;
  }

  const clone: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if ((key === "data" || key === "stringData") && isObject(child)) {
      clone[key] = Object.fromEntries(Object.keys(child as Record<string, unknown>).map((entry) => [entry, REDACTED]));
    } else {
      clone[key] = redactSecretDataMaps(child);
    }
  }

  return clone;
};

const bodyForLog = (body: unknown, secretValues: string[]): unknown => {
  const parsed = parseMaybeJson(body);

  if (parsed === undefined) {
    // An unparseable body on a Secret request cannot be redacted with any
    // guarantee, so it is never logged verbatim.
    return isString(body) ? "[redacted: unparseable body]" : body;
  }

  return scrubSecretValues(redactSecretDataMaps(parsed), secretValues);
};

/** Unwraps the structured Kubernetes payload held by JsonApiErrorParsed. */
const unwrapErrorPayload = (payload: unknown): unknown =>
  isObject(payload) && isObject((payload as { error?: unknown }).error)
    ? (payload as { error: unknown }).error
    : payload;

const safeStatusCode = (payload: unknown): number | undefined => {
  const unwrapped = unwrapErrorPayload(payload);

  return isObject(unwrapped) && typeof (unwrapped as { code?: unknown }).code === "number"
    ? (unwrapped as { code: number }).code
    : undefined;
};

const safeClassification = (payload: unknown, fallback: string): string => {
  const unwrapped = unwrapErrorPayload(payload);

  if (isObject(unwrapped)) {
    const { reason, status } = unwrapped as { reason?: unknown; status?: unknown };

    if (isString(reason) && reason !== "") {
      return reason;
    }

    if (isString(status) && status !== "") {
      return status;
    }
  }

  return fallback;
};

/**
 * Fail-closed log shape for a Secret request whose payload cannot be proven to
 * contain only redacted material: method, sanitized endpoint, HTTP status code
 * and an error classification. No headers, body or server text are included.
 */
const safeMetadataForLog = (method: string, reqUrl: string, payload: unknown, fallback: string) => {
  const statusCode = safeStatusCode(payload);

  return {
    requestMethod: method,
    endpoint: reqUrl.split("?")[0],
    ...(statusCode !== undefined ? { statusCode } : {}),
    classification: safeClassification(payload, fallback),
    redaction: "metadata-only",
  };
};

const isSecretPayload = (value: unknown): boolean => isObject(value) && (value as { kind?: unknown }).kind === "Secret";

/**
 * Redacts Secrets before debug logging.
 *
 * - Request bodies: `data` / `stringData` maps are structurally redacted and
 *   every value collected from Secret manifests or JSON Patch operations is
 *   scrubbed from the rest of the body.
 * - Secret responses (`kind: "Secret"`): same structural redaction plus exact
 *   value scrubbing.
 * - Any other response of a Secret request (for example a `kind: "Status"`
 *   error, which may echo stored values we never saw): never logged raw. Only
 *   safe metadata is recorded.
 *
 * Non-Secret requests are returned untouched.
 */
const redactSecretManifestsForLog = (
  method: string,
  reqUrl: string,
  params: Record<string, unknown>,
): Record<string, unknown> => {
  const bodySecretValues = collectSecretValuesFromBody(params.reqInit);
  const isSecretRequest = SECRET_ENDPOINT_PATTERN.test(reqUrl) || bodySecretValues.length > 0;

  if (!isSecretRequest) {
    return params;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    if (key === "reqInit" && isObject(value)) {
      const init = { ...(value as Record<string, unknown>) };

      init.body = bodyForLog(init.body, bodySecretValues);
      redacted[key] = init;
    } else if (isSecretPayload(parseMaybeJson(value)) || isSecretPayload(value)) {
      redacted[key] = scrubSecretValues(redactSecretDataMaps(parseMaybeJson(value) ?? value), bodySecretValues);
    } else {
      redacted[key] = safeMetadataForLog(method, reqUrl, value, key);
    }
  }

  return redacted;
};

export class JsonApiErrorParsed {
  isUsedForNotification = false;

  constructor(public readonly error: JsonApiError | DOMException | KubeJsonApiError, private messages: string[]) {}

  get isAborted() {
    return this.error.code === DOMException.ABORT_ERR;
  }

  toString() {
    return this.messages.join("\n");
  }
}

export class JsonApi<Data = JsonApiData, Params extends JsonApiParams<Data> = JsonApiParams<Data>> {
  static readonly reqInitDefault = {
    headers: {
      "content-type": "application/json",
    },
  };

  protected readonly reqInit: Defaulted<RequestInit, keyof (typeof JsonApi)["reqInitDefault"]>;

  static readonly configDefault: Partial<JsonApiConfig> = {
    debug: false,
  };

  constructor(
    protected readonly dependencies: JsonApiDependencies,
    public readonly config: JsonApiConfig,
    reqInit?: RequestInit,
  ) {
    this.config = Object.assign({}, JsonApi.configDefault, config);
    this.reqInit = merge({}, JsonApi.reqInitDefault, reqInit);
    this.parseResponse = this.parseResponse.bind(this);
    this.getRequestOptions = config.getRequestOptions ?? (() => Promise.resolve({}));
  }

  public readonly onData = new EventEmitter<[Data, Response]>();

  public readonly onError = new EventEmitter<[JsonApiErrorParsed, Response]>();

  private readonly getRequestOptions: GetRequestOptions;

  async getResponse<Query>(
    path: string,
    params?: ParamsAndQuery<Params, Query>,
    init: RequestInit = {},
  ): Promise<Response> {
    let reqUrl = `${this.config.serverAddress}${this.config.apiBase}${path}`;
    const reqInit = merge(
      {
        method: "get",
        agent: reqUrl.startsWith("https:") ? httpsAgent : httpAgent,
      },
      this.reqInit,
      await this.getRequestOptions(),
      init,
    );
    const { query } = params ?? {};

    if (query && Object.keys(query).length > 0) {
      const queryString = stringify(query as unknown as QueryParams);

      reqUrl += (reqUrl.includes("?") ? "&" : "?") + queryString;
    }

    return this.dependencies.fetch(reqUrl, reqInit);
  }

  get<OutData = Data, Query = QueryParams>(
    path: string,
    params?: ParamsAndQuery<Params, Query>,
    reqInit: RequestInit = {},
  ) {
    return this.request<OutData, Query>(path, params, { ...reqInit, method: "get" });
  }

  post<OutData = Data, Query = QueryParams>(
    path: string,
    params?: ParamsAndQuery<Params, Query>,
    reqInit: RequestInit = {},
  ) {
    return this.request<OutData, Query>(path, params, { ...reqInit, method: "post" });
  }

  put<OutData = Data, Query = QueryParams>(
    path: string,
    params?: ParamsAndQuery<Params, Query>,
    reqInit: RequestInit = {},
  ) {
    return this.request<OutData, Query>(path, params, { ...reqInit, method: "put" });
  }

  patch<OutData = Data, Query = QueryParams>(
    path: string,
    params?: ParamsAndQuery<Omit<Params, "data">, Query> & { data?: Patch | PartialDeep<Data> },
    reqInit: RequestInit = {},
  ) {
    return this.request<OutData, Query>(path, params, { ...reqInit, method: "patch" });
  }

  del<OutData = Data, Query = QueryParams>(
    path: string,
    params?: ParamsAndQuery<Params, Query>,
    reqInit: RequestInit = {},
  ) {
    return this.request<OutData, Query>(path, params, { ...reqInit, method: "delete" });
  }

  protected async request<OutData, Query = QueryParams>(
    path: string,
    params: (ParamsAndQuery<Omit<Params, "data">, Query> & { data?: unknown }) | undefined,
    init: Defaulted<RequestInit, "method">,
  ) {
    let reqUrl = `${this.config.serverAddress}${this.config.apiBase}${path}`;
    const reqInit = merge({}, this.reqInit, await this.getRequestOptions(), init);
    const { data, query } = params || {};

    if (data && !reqInit.body) {
      reqInit.body = JSON.stringify(data);
    }

    if (query && Object.keys(query).length > 0) {
      const queryString = stringify(query as unknown as QueryParams);

      reqUrl += (reqUrl.includes("?") ? "&" : "?") + queryString;
    }
    const infoLog: JsonApiLog = {
      method: reqInit.method.toUpperCase(),
      reqUrl,
      reqInit,
    };

    const res = await this.dependencies.fetch(reqUrl, reqInit);

    return (await this.parseResponse(res, infoLog)) as OutData;
  }

  protected async parseResponse(res: Response, log: JsonApiLog): Promise<Data> {
    const { status } = res;

    const text = await res.text();
    const parseResponse = json.parse(text || "{}");
    const data = parseResponse.callWasSuccessful ? (parseResponse.response as Data) : (text as Data);

    if (status >= 200 && status < 300) {
      this.onData.emit(data, res);
      this.writeLog({ ...log, data });

      return data;
    }

    if (log.method === "GET" && res.status === 403) {
      this.writeLog({ ...log, error: data });
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw data;
    }

    const error = new JsonApiErrorParsed(data as JsonApiError, this.parseError(data, res));

    this.onError.emit(error, res);
    this.writeLog({ ...log, error });

    // eslint-disable-next-line @typescript-eslint/no-throw-literal
    throw error;
  }

  protected parseError(error: unknown, res: Response): string[] {
    if (isString(error)) {
      return [error];
    }

    if (!isObject(error)) {
      return [];
    }

    const { errors, message } = error as { errors?: { title: string }[]; message?: string };

    if (Array.isArray(errors)) {
      return errors.map((error) => error.title);
    }

    if (isString(message)) {
      return [message];
    }

    return [res.statusText || "Error!"];
  }

  protected writeLog(log: JsonApiLog) {
    const { method, reqUrl, ...params } = log;

    this.dependencies.logger.debug(
      `[JSON-API] request ${method} ${reqUrl}`,
      redactSecretManifestsForLog(method, reqUrl, params),
    );
  }
}
