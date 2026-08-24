import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { getApiError } from '../models/api-error.model';
import {
  Retirement,
  RetirementRequest,
  RetirementCertificate,
  RetirementPrepareResponse,
  RetirementSubmitRequest,
} from '../models/retirement.model';
import { PaginatedResponse } from '../models/pagination.model';

@Injectable({ providedIn: 'root' })
export class RetirementService {
  constructor(private api: ApiService) {}

  async getRetirements(params?: {
    page?: number;
    limit?: number;
  }): Promise<PaginatedResponse<Retirement>> {
    return this.api.get<PaginatedResponse<Retirement>>('/retirements', { params });
  }

  async getRetirement(id: string): Promise<Retirement> {
    return this.api.get<Retirement>(`/retirements/${id}`);
  }

  /**
   * Step 1 of the two-phase commit.
   *
   * Attempts POST /retirements/prepare first (two-step backend).
   * Falls back to POST /retirements (legacy single-step backend) on 404.
   *
   * In the legacy path the backend creates a confirmed record immediately,
   * so `RetirementPrepareResponse.unsignedXdr` will be absent — the effect
   * skips the Freighter-signing step and emits `retirementConfirmed` directly.
   */
  async prepareRetirement(data: RetirementRequest): Promise<RetirementPrepareResponse> {
    try {
      return await this.api.post<RetirementPrepareResponse>('/retirements/prepare', data);
    } catch (err: unknown) {
      // 404 → backend doesn't implement /prepare; fall back to single-POST.
      const status = getApiError(err)?.status;
      if (status === 404) {
        const retirement = await this.api.post<Retirement>('/retirements', data);
        // No XDR → the legacy backend already committed the record.
        return { retirement };
      }
      throw err;
    }
  }

  /**
   * Step 3 of the two-phase commit.
   * Submits the Freighter-signed XDR back to the backend for on-chain broadcast.
   */
  async submitRetirement(payload: RetirementSubmitRequest): Promise<Retirement> {
    return this.api.post<Retirement>('/retirements/submit', payload);
  }

  async getCertificate(id: string): Promise<RetirementCertificate> {
    return this.api.get<RetirementCertificate>(`/retirements/${id}/certificate`);
  }
}
