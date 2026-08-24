/**
 * Normalised HTTP error surfaced by {@link ApiService}.
 *
 * Why a class and not a plain object:
 *   The previous normalisation did `{ ...axiosError, message }`.  `AxiosError`
 *   extends `Error`, and `Error` own properties (`message`, `stack`) plus the
 *   Axios-assigned ones (`response`, `status`, `config`, ...) are defined as
 *   non-enumerable, so spreading produced `{ message }` and silently dropped
 *   every piece of server error semantics.  Consumers branching on
 *   `err.response?.status` always saw `undefined`, and `err instanceof Error`
 *   was `false`, so even the friendly message fell back to a generic string.
 *
 *   `ApiError` extends `Error` so it survives `Promise.reject` unchanged, keeps
 *   working with the codebase-wide `err instanceof Error` checks, and carries
 *   the status/response/data needed for status-specific UX.
 */

/** Minimal view of the HTTP response attached to a failed request. */
export interface ApiErrorResponse<TData = unknown> {
  status: number;
  statusText: string;
  data: TData;
  headers: Record<string, unknown>;
}

/** Server-reported validation messages, keyed by form field name. */
export type ApiFieldErrors = Record<string, string[]>;

/** Construction options for {@link ApiError}. */
export interface ApiErrorInit<TData = unknown> {
  response?: ApiErrorResponse<TData>;
  /** Axios error code, e.g. `ERR_NETWORK`, `ECONNABORTED`. */
  code?: string;
  /** Request URL, retained for logging. */
  url?: string;
  /** Request method, retained for logging. */
  method?: string;
  /** The original error (an `AxiosError`), kept for logging and debugging. */
  cause?: unknown;
}

export class ApiError<TData = unknown> extends Error {
  override readonly name: string = 'ApiError';

  /** HTTP status code, or `undefined` when the request never got a response. */
  readonly status?: number;

  /** The response that carried the error, when one was received. */
  readonly response?: ApiErrorResponse<TData>;

  /** Shorthand for `response.data` — the parsed server error body. */
  readonly data?: TData;

  /** Axios error code (`ERR_NETWORK`, `ECONNABORTED`, ...) when available. */
  readonly code?: string;

  readonly url?: string;
  readonly method?: string;

  /** Validation messages keyed by field, parsed from the response body. */
  readonly fieldErrors: ApiFieldErrors;

  constructor(message: string, init: ApiErrorInit<TData> = {}) {
    super(message, { cause: init.cause });

    // Required so `instanceof` holds when the class is down-levelled.
    Object.setPrototypeOf(this, new.target.prototype);

    this.response = init.response;
    this.status = init.response?.status;
    this.data = init.response?.data;
    this.code = init.code;
    this.url = init.url;
    this.method = init.method;
    this.fieldErrors = extractFieldErrors(init.response?.data);

    // Prefer the originating stack — it points at the call site that issued
    // the request rather than at the interceptor that normalised the error.
    const originalStack = init.cause instanceof Error ? init.cause.stack : undefined;
    if (originalStack) {
      this.stack = originalStack;
    }
  }

  /** True when the request failed before any response was received. */
  get isNetworkError(): boolean {
    return this.response === undefined;
  }

  /** First server-reported validation message for `field`, if any. */
  fieldError(field: string): string | undefined {
    return this.fieldErrors[field]?.[0];
  }

  /** The first `[field, message]` pair reported by the server, if any. */
  firstFieldError(): { field: string; message: string } | undefined {
    for (const [field, messages] of Object.entries(this.fieldErrors)) {
      const message = messages[0];
      if (message) {
        return { field, message };
      }
    }
    return undefined;
  }
}

/** Type guard for {@link ApiError}. */
export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/**
 * Narrowing accessor for call sites that only care about the API shape:
 * `getApiError(err)?.status === 404`.
 */
export function getApiError(error: unknown): ApiError | undefined {
  return error instanceof ApiError ? error : undefined;
}

/**
 * Parse field-level validation errors out of a server error body.
 *
 * Supports the two shapes the backend emits for 422 responses:
 *   { errors: { amount: ["must be positive"] } }
 *   { errors: [{ field: "amount", message: "must be positive" }] }
 */
function extractFieldErrors(data: unknown): ApiFieldErrors {
  if (!isRecord(data)) {
    return {};
  }

  const errors = data['errors'];
  const result: ApiFieldErrors = {};

  if (Array.isArray(errors)) {
    for (const entry of errors) {
      if (!isRecord(entry)) continue;
      const field = entry['field'] ?? entry['path'] ?? entry['param'];
      const message = entry['message'];
      if (typeof field === 'string' && typeof message === 'string') {
        (result[field] ??= []).push(message);
      }
    }
    return result;
  }

  if (isRecord(errors)) {
    for (const [field, value] of Object.entries(errors)) {
      const messages = (Array.isArray(value) ? value : [value]).filter(
        (m): m is string => typeof m === 'string',
      );
      if (messages.length > 0) {
        result[field] = messages;
      }
    }
  }

  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
