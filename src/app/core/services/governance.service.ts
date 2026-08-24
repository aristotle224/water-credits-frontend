import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { getApiError } from '../models/api-error.model';
import { Proposal, GovernanceConfig } from '../models/proposal.model';
import { PaginatedResponse } from '../models/pagination.model';

@Injectable({ providedIn: 'root' })
export class GovernanceService {
  constructor(private api: ApiService) {}

  async getProposals(params?: {
    page?: number;
    limit?: number;
    status?: string;
  }): Promise<PaginatedResponse<Proposal>> {
    return this.api.get<PaginatedResponse<Proposal>>('/governance/proposals', { params });
  }

  async getProposal(id: string): Promise<Proposal> {
    return this.api.get<Proposal>(`/governance/proposals/${id}`);
  }

  async createProposal(data: {
    title: string;
    description: string;
    actionType: string;
    actionParams: Record<string, string | number | boolean>;
  }): Promise<Proposal> {
    return this.api.post<Proposal>('/governance/proposals', data);
  }

  async prepareVote(
    proposalId: string,
    vote: 'for' | 'against',
  ): Promise<{ unsignedXdr?: string; networkPassphrase?: string; proposal?: Proposal }> {
    try {
      return await this.api.post<{
        unsignedXdr?: string;
        networkPassphrase?: string;
        proposal?: Proposal;
      }>(`/governance/proposals/${proposalId}/vote/prepare`, { vote });
    } catch (err: unknown) {
      const status = getApiError(err)?.status;
      if (status === 404) {
        await this.api.post<void>(`/governance/proposals/${proposalId}/vote`, { vote });
        return {};
      }
      throw err;
    }
  }

  async submitVote(proposalId: string, signedXdr: string): Promise<Proposal> {
    return this.api.post<Proposal>(`/governance/proposals/${proposalId}/vote/submit`, {
      signedXdr,
    });
  }

  async vote(proposalId: string, vote: 'for' | 'against'): Promise<void> {
    return this.api.post<void>(`/governance/proposals/${proposalId}/vote`, { vote });
  }

  async execute(proposalId: string): Promise<void> {
    return this.api.post<void>(`/governance/proposals/${proposalId}/execute`);
  }

  async getConfig(): Promise<GovernanceConfig> {
    return this.api.get<GovernanceConfig>('/governance/config');
  }

  async updateConfig(data: Partial<GovernanceConfig>): Promise<GovernanceConfig> {
    return this.api.patch<GovernanceConfig>('/governance/config', data);
  }
}
