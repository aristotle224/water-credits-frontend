import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { getApiError } from '../models/api-error.model';
import { Bmp } from '../models/bmp.model';

/**
 * HTTP client for farmer-specific BMP (Best Management Practice) operations.
 *
 * All methods delegate to ApiService which attaches the JWT and handles 401s.
 */
@Injectable({ providedIn: 'root' })
export class FarmersService {
  constructor(private api: ApiService) {}

  /**
   * Returns the full list of available BMPs with server-authoritative enrolled
   * status for the authenticated farmer.
   *
   * Endpoint: GET /farmers/practices
   *
   * 404 fallback: the backend BMP endpoint is not yet deployed on all
   * environments. A 404 response is treated as "no practices configured"
   * rather than a hard error, consistent with the pattern used in
   * RetirementService.prepareRetirement(). An empty array is returned and
   * the UI will show the empty-state. Any other HTTP error is re-thrown so
   * the effect can surface it to the user.
   */
  async getBmps(): Promise<Bmp[]> {
    try {
      return await this.api.get<Bmp[]>('/farmers/practices');
    } catch (err: unknown) {
      const status = getApiError(err)?.status;
      if (status === 404) {
        // Backend endpoint not yet available — degrade gracefully.
        return [];
      }
      throw err;
    }
  }

  /**
   * Enrolls the authenticated farmer in a BMP.
   *
   * Endpoint: POST /farmers/practices/:id/enroll
   *
   * Returns the updated Bmp object with `enrolled: true`.
   */
  async enrollBmp(practiceId: string): Promise<Bmp> {
    return this.api.post<Bmp>(`/farmers/practices/${practiceId}/enroll`);
  }

  /**
   * Unenrolls the authenticated farmer from a BMP.
   *
   * Endpoint: DELETE /farmers/practices/:id/enroll
   */
  async unenrollBmp(practiceId: string): Promise<void> {
    return this.api.delete<void>(`/farmers/practices/${practiceId}/enroll`);
  }
}
