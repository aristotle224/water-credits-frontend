import { TestBed } from '@angular/core/testing';
import { AxiosError, AxiosHeaders, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';

import { ApiService } from './api.service';
import { SessionBusService } from './session-bus.service';
import { ApiError, getApiError, isApiError } from '../models/api-error.model';

/**
 * Builds a request config whose adapter rejects with a realistic AxiosError,
 * so the real response interceptor (and therefore mapError) runs.  Using the
 * per-request `adapter` hook keeps the test on axios' public API instead of
 * reaching into the service's private instance.
 */
function failingWith(
  status: number | null,
  data: unknown,
  options: { statusText?: string; code?: string } = {},
): AxiosRequestConfig {
  return {
    adapter: (config: InternalAxiosRequestConfig) => {
      const response =
        status === null
          ? undefined
          : {
              data,
              status,
              statusText: options.statusText ?? '',
              headers: new AxiosHeaders({ 'x-request-id': 'req-42' }),
              config,
            };

      return Promise.reject(
        new AxiosError(
          status === null ? 'Network Error' : `Request failed with status code ${status}`,
          options.code,
          config,
          {},
          response,
        ),
      );
    },
  };
}

describe('ApiService', () => {
  let service: ApiService;
  let sessionBus: SessionBusService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ApiService);
    sessionBus = TestBed.inject(SessionBusService);
  });

  describe('error normalisation', () => {
    it('preserves status and response.data for a 422 validation failure', async () => {
      const body = {
        message: 'Validation failed',
        errors: { amount: ['must not exceed your available balance'] },
      };

      const error = await service
        .post('/marketplace/listings', {}, failingWith(422, body, { statusText: 'Unprocessable' }))
        .then(
          () => null,
          (err: unknown) => err,
        );

      expect(isApiError(error)).toBe(true);
      const apiError = error as ApiError;
      expect(apiError.status).toBe(422);
      expect(apiError.response?.status).toBe(422);
      expect(apiError.response?.statusText).toBe('Unprocessable');
      expect(apiError.response?.data).toEqual(body);
      expect(apiError.data).toEqual(body);
      expect(apiError.message).toBe('Validation failed');
    });

    it('is an Error instance so `err instanceof Error` branches keep working', async () => {
      const error = await service.get('/credits', failingWith(500, { message: 'Boom' })).then(
        () => null,
        (err: unknown) => err,
      );

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).name).toBe('ApiError');
      expect((error as ApiError).stack).toBeTruthy();
    });

    it('keeps the originating AxiosError accessible for logging', async () => {
      const error = await service.get('/credits', failingWith(500, { message: 'Boom' })).then(
        () => null,
        (err: unknown) => err,
      );

      const cause = (error as ApiError).cause;
      expect(cause).toBeInstanceOf(AxiosError);
      expect((cause as AxiosError).response?.status).toBe(500);
    });

    it('records request metadata and response headers', async () => {
      const error = await service
        .delete('/marketplace/listings/l-1', failingWith(403, { message: 'Forbidden' }))
        .then(
          () => null,
          (err: unknown) => err,
        );

      const apiError = error as ApiError;
      expect(apiError.url).toBe('/marketplace/listings/l-1');
      expect(apiError.method).toBe('delete');
      expect(apiError.response?.headers['x-request-id']).toBe('req-42');
    });

    it('exposes field errors from the object form of the 422 body', async () => {
      const error = await service
        .post('/marketplace/listings', {}, failingWith(422, { errors: { price: ['is required'] } }))
        .then(
          () => null,
          (err: unknown) => err,
        );

      const apiError = error as ApiError;
      expect(apiError.fieldErrors).toEqual({ price: ['is required'] });
      expect(apiError.fieldError('price')).toBe('is required');
      expect(apiError.firstFieldError()).toEqual({ field: 'price', message: 'is required' });
    });

    it('exposes field errors from the array form of the 422 body', async () => {
      const body = { errors: [{ field: 'amount', message: 'must be positive' }] };

      const error = await service.post('/marketplace/listings', {}, failingWith(422, body)).then(
        () => null,
        (err: unknown) => err,
      );

      expect((error as ApiError).firstFieldError()).toEqual({
        field: 'amount',
        message: 'must be positive',
      });
    });

    it('falls back to the generic message when the body carries none', async () => {
      const error = await service.get('/credits', failingWith(500, '<html>oops</html>')).then(
        () => null,
        (err: unknown) => err,
      );

      expect((error as ApiError).message).toBe('An unexpected error occurred');
      expect((error as ApiError).fieldErrors).toEqual({});
    });

    it('marks a response-less failure as a network error', async () => {
      const error = await service
        .get('/credits', failingWith(null, undefined, { code: 'ERR_NETWORK' }))
        .then(
          () => null,
          (err: unknown) => err,
        );

      const apiError = error as ApiError;
      expect(apiError.status).toBeUndefined();
      expect(apiError.response).toBeUndefined();
      expect(apiError.isNetworkError).toBe(true);
      expect(apiError.code).toBe('ERR_NETWORK');
    });

    it('getApiError narrows an ApiError and ignores unrelated errors', async () => {
      const error = await service.get('/farmers/practices', failingWith(404, {})).then(
        () => null,
        (err: unknown) => err,
      );

      expect(getApiError(error)?.status).toBe(404);
      expect(getApiError(new Error('nope'))).toBeUndefined();
    });
  });

  describe('401 handling', () => {
    it('notifies the session bus before the error is normalised', async () => {
      const notifySpy = vi.spyOn(sessionBus, 'notifyUnauthorized');

      const error = await service.get('/credits', failingWith(401, { message: 'Expired' })).then(
        () => null,
        (err: unknown) => err,
      );

      expect(notifySpy).toHaveBeenCalledTimes(1);
      expect((error as ApiError).status).toBe(401);
    });

    it('does not notify the session bus for other statuses', async () => {
      const notifySpy = vi.spyOn(sessionBus, 'notifyUnauthorized');

      await service.get('/credits', failingWith(403, { message: 'Forbidden' })).catch(() => null);

      expect(notifySpy).not.toHaveBeenCalled();
    });
  });
});
