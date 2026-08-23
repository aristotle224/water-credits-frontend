import { Injectable } from '@angular/core';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { environment } from '../../../environments/environment';
import { SessionBusService } from './session-bus.service';

/**
 * HTTP client wrapper around axios.
 *
 * Token ownership:
 *   The JWT is owned exclusively by NgRx AuthState.  This service receives
 *   it via a registered callback (setTokenProvider) that AuthEffects calls
 *   once on startup, pointing at a Store selector read.  This avoids
 *   injecting Store here (which would create a circular DI chain via
 *   Effects → ApiService → Store).
 *
 * 401 handling:
 *   On a 401 response, SessionBusService.notifyUnauthorized() is called.
 *   AuthEffects listens on that bus and dispatches forceLogout, which
 *   clears localStorage, redirects, and disconnects the WebSocket as a
 *   single unified code path.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private axiosInstance: AxiosInstance;

  /**
   * Registered by AuthEffects on startup. Returns the current JWT from the
   * NgRx store synchronously (via Store.selectSignal or a cached value).
   */
  private tokenProvider: (() => string | null) | null = null;

  constructor(private sessionBus: SessionBusService) {
    this.axiosInstance = axios.create({
      baseURL: environment.apiUrl,
      headers: { 'Content-Type': 'application/json' },
    });

    // ── Request interceptor: attach JWT ───────────────────────────────────
    this.axiosInstance.interceptors.request.use(
      (config) => {
        const token = this.tokenProvider?.() ?? null;
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        if (config.url && config.headers) {
          const isSensitive = /^\/?(retirements|credits|analytics|marketplace)(\/|$)/.test(
            config.url,
          );
          if (isSensitive) {
            config.headers['Cache-Control'] = 'no-store';
          }
        }
        return config;
      },
      (error) => Promise.reject(error),
    );

    // ── Response interceptor: map errors, handle 401 ──────────────────────
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          // Do NOT touch localStorage here — the effects own that.
          this.sessionBus.notifyUnauthorized();
        }
        return Promise.reject(this.mapError(error));
      },
    );
  }

  /**
   * Register the token provider.  Called once by AuthEffects on init so that
   * the request interceptor can read the current token from the store without
   * a circular DI dependency.
   */
  setTokenProvider(provider: () => string | null): void {
    this.tokenProvider = provider;
  }

  private mapError(error: AxiosError): { message: string; [key: string]: unknown } {
    const message =
      (error.response?.data as { message?: string })?.message ?? 'An unexpected error occurred';
    return { ...error, message };
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(url, config);
    return response.data;
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.put(url, data, config);
    return response.data;
  }

  async patch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.patch(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.delete(url, config);
    return response.data;
  }

  /**
   * Upload a single file via multipart/form-data.
   *
   * The server responds with the stored file ID that can be referenced
   * in subsequent resource creation payloads (e.g. project documents).
   *
   * @param file      The browser File object to upload.
   * @param fieldName The multipart field name expected by the server (default: "file").
   * @returns         The server-assigned file ID.
   */
  async uploadFile(file: File, fieldName = 'file'): Promise<{ fileId: string }> {
    const formData = new FormData();
    formData.append(fieldName, file, file.name);

    const response: AxiosResponse<{ fileId: string }> = await this.axiosInstance.post(
      '/uploads',
      formData,
      {
        // Let the browser set the correct Content-Type boundary automatically
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    );
    return response.data;
  }
}
