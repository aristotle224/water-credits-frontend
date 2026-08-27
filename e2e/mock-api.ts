import { Route } from '@playwright/test';

/**
 * Hermetic API stub for the Playwright e2e suite.
 *
 * Every backend call the application makes is intercepted at the network layer
 * (see `registerMockApi`) and fulfilled from in-memory fixtures here. This
 * means the e2e run has zero dependency on a live backend, a Stellar node, or
 * the testnet — and cannot be flaky due to network conditions.
 *
 * The journeys only assert on end-state UI (e.g. "the certificate page was
 * reached"), never on internal store details, so the exact response shapes
 * here are free to evolve with the API.
 */

const API_PREFIX = '/api/v1';

/** Deterministic, valid-looking Stellar public key (G + 55 chars). */
export const TEST_WALLET_ADDRESS = 'G' + 'A'.repeat(55);
/** A different seller so buy-flow listings are not owned by the test user. */
const OTHER_SELLER_ADDRESS = 'G' + 'B'.repeat(55);

interface MockUser {
  id: string;
  wallet: string;
  displayName: string;
  roles: string[];
  email: string;
}

const user: MockUser = {
  id: 'usr_e2e',
  wallet: TEST_WALLET_ADDRESS,
  displayName: 'E2E Tester',
  roles: ['user'],
  email: 'e2e@example.com',
};

interface MockProject {
  id: string;
  name: string;
  methodology: string;
  areaHectares: number;
  totalCreditsMinted: number;
  totalCreditsRetired: number;
  creditPrice: number;
  status: string;
  ownerId: string;
  latitude: number;
  longitude: number;
  baselineStart: string;
  baselineEnd: string;
  createdAt: string;
  description: string;
}

const projects: MockProject[] = [
  {
    id: 'proj-1',
    name: 'Clean River Project',
    methodology: 'Wetland Restoration',
    areaHectares: 120,
    totalCreditsMinted: 1000,
    totalCreditsRetired: 200,
    creditPrice: 1.5,
    status: 'verified',
    ownerId: TEST_WALLET_ADDRESS,
    latitude: 12.34,
    longitude: 56.78,
    baselineStart: '2024-01-01',
    baselineEnd: '2024-06-01',
    createdAt: '2024-01-02T00:00:00Z',
    description: 'Restoring wetlands along the Clean River basin.',
  },
  {
    id: 'proj-2',
    name: 'Blue Lake Restoration',
    methodology: 'Riparian Buffer',
    areaHectares: 80,
    totalCreditsMinted: 500,
    totalCreditsRetired: 0,
    creditPrice: 2,
    status: 'verified',
    ownerId: OTHER_SELLER_ADDRESS,
    latitude: 23.45,
    longitude: 67.89,
    baselineStart: '2024-02-01',
    baselineEnd: '2024-07-01',
    createdAt: '2024-02-02T00:00:00Z',
    description: 'Re-establishing riparian buffers around Blue Lake.',
  },
];

interface MockListing {
  id: string;
  projectId: string;
  projectName: string;
  sellerId: string;
  sellerName?: string;
  amount: string;
  price: number;
  totalValue: number;
  status: 'active' | 'filled' | 'cancelled' | 'expired';
  createdAt: string;
}

const listings: MockListing[] = [
  {
    id: 'listing-buy-1',
    projectId: 'proj-2',
    projectName: 'Blue Lake Restoration',
    sellerId: OTHER_SELLER_ADDRESS,
    sellerName: 'Lake Trust',
    amount: '500',
    price: 2,
    totalValue: 1000,
    status: 'active',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

function projectName(projectId: string): string {
  return projects.find((p) => p.id === projectId)?.name ?? 'Unknown Project';
}

function corsHeaders(): Record<string, string> {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization',
  };
}

interface MockResult {
  status: number;
  body: unknown;
}

/** Safe fallback for any endpoint the three journeys do not explicitly model. */
function fallback(_method: string, _path: string): MockResult {
  // List-shaped endpoints are common; returning an empty page keeps effects
  // from throwing. Object endpoints get an empty object.
  return { status: 200, body: { data: [], total: 0, page: 1, totalPages: 0 } };
}

function routeRequest(method: string, path: string, body: Record<string, unknown> | null): MockResult {
  // ── Auth ────────────────────────────────────────────────────────────────
  if (method === 'POST' && path === '/auth/challenge') {
    return { status: 200, body: { challenge: `e2e-challenge-${Date.now()}` } };
  }
  if (method === 'POST' && path === '/auth/login') {
    return { status: 200, body: { token: 'e2e-jwt-token', user } };
  }
  if (method === 'GET' && path === '/users/me') {
    return { status: 200, body: user };
  }

  // ── Projects ──────────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/projects') {
    return {
      status: 200,
      body: { data: projects, total: projects.length, page: 1, totalPages: 1 },
    };
  }
  if (method === 'GET' && /^\/projects\/[^/]+$/.test(path)) {
    const id = path.split('/')[2];
    const project = projects.find((p) => p.id === id) ?? projects[0];
    return { status: 200, body: project };
  }

  // ── Retirement ──────────────────────────────────────────────────────────
  if (method === 'POST' && path === '/retirements/prepare') {
    const id = `ret-${Date.now()}`;
    return {
      status: 200,
      body: {
        retirement: {
          id,
          amount: body?.['amount'] ?? '0',
          projectId: body?.['projectId'] ?? 'proj-1',
          projectName: projectName(String(body?.['projectId'] ?? 'proj-1')),
          purpose: body?.['purpose'] ?? 'Voluntary Retirement',
          status: 'pending',
        },
        // unsignedXdr present → exercises the wallet signTx mock.
        unsignedXdr: `UNSIGNED_XDR_${id}`,
      },
    };
  }
  if (method === 'POST' && path === '/retirements/submit') {
    const id = String(body?.['retirementId'] ?? 'ret-unknown');
    return {
      status: 200,
      body: {
        id,
        amount: body?.['amount'] ?? '100',
        projectId: 'proj-1',
        projectName: 'Clean River Project',
        purpose: body?.['purpose'] ?? 'Voluntary Retirement',
        status: 'confirmed',
        retireeAddress: TEST_WALLET_ADDRESS,
        retiredAt: new Date().toISOString(),
        txHash: `TX_${id}`,
        certificateIpfsUri: `ipfs://bafy${id}`,
      },
    };
  }
  if (method === 'GET' && /^\/retirements\/[^/]+\/certificate$/.test(path)) {
    const id = path.split('/')[2];
    return {
      status: 200,
      body: {
        id,
        retireeAddress: TEST_WALLET_ADDRESS,
        amount: 100,
        projectName: 'Clean River Project',
        retiredAt: new Date().toISOString(),
        purpose: 'Voluntary Retirement',
        txHash: `TX_${id}`,
        certificateIpfsUri: `ipfs://bafy${id}`,
      },
    };
  }
  if (method === 'GET' && /^\/retirements\/[^/]+$/.test(path)) {
    const id = path.split('/')[2];
    return {
      status: 200,
      body: { id, amount: 100, projectId: 'proj-1', projectName: 'Clean River Project' },
    };
  }

  // ── Marketplace ──────────────────────────────────────────────────────────
  if (method === 'GET' && path === '/marketplace/listings') {
    return {
      status: 200,
      body: { data: listings, total: listings.length, page: 1, totalPages: 1 },
    };
  }
  if (method === 'GET' && /^\/marketplace\/listings\/[^/]+$/.test(path)) {
    const id = path.split('/')[3];
    const listing = listings.find((l) => l.id === id) ?? listings[0];
    return { status: 200, body: listing };
  }
  if (method === 'POST' && path === '/marketplace/listings') {
    const listing: MockListing = {
      id: `listing-new-${Date.now()}`,
      projectId: String(body?.['projectId'] ?? 'proj-1'),
      projectName: projectName(String(body?.['projectId'] ?? 'proj-1')),
      sellerId: TEST_WALLET_ADDRESS,
      sellerName: user.displayName,
      amount: String(body?.['amount'] ?? '0'),
      price: Number(body?.['price'] ?? 0),
      totalValue: parseFloat(String(body?.['amount'] ?? '0')) * Number(body?.['price'] ?? 0),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    listings.push(listing);
    return { status: 201, body: listing };
  }
  if (method === 'POST' && /^\/marketplace\/listings\/[^/]+\/buy$/.test(path)) {
    const id = path.split('/')[3];
    const listing = listings.find((l) => l.id === id) ?? listings[0];
    return { status: 200, body: { listing, unsignedXdr: `UNSIGNED_XDR_${id}` } };
  }
  if (method === 'POST' && /^\/marketplace\/listings\/[^/]+\/submit$/.test(path)) {
    const id = path.split('/')[3];
    const listing = listings.find((l) => l.id === id) ?? listings[0];
    return { status: 200, body: listing };
  }

  return fallback(method, path);
}

/**
 * Intercept a single API request and fulfill it from the in-memory stubs.
 * Registered once per page via `registerMockApi`.
 */
export async function handleMockApi(route: Route): Promise<void> {
  const request = route.request();
  const method = request.method();

  // Answer CORS preflight directly so cross-origin axios calls succeed.
  if (method === 'OPTIONS') {
    await route.fulfill({ status: 204, headers: corsHeaders() });
    return;
  }

  const raw = request.postData();
  let parsed: Record<string, unknown> | null = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      parsed = null;
    }
  }

  const url = new URL(request.url());
  const path = url.pathname.startsWith(API_PREFIX)
    ? url.pathname.slice(API_PREFIX.length)
    : url.pathname;

  const result = routeRequest(method, path, parsed);

  await route.fulfill({
    status: result.status,
    headers: { ...corsHeaders(), 'content-type': 'application/json' },
    body: JSON.stringify(result.body),
  });
}

/** Cross-origin matcher for every call the app sends to `/api/v1/...`. */
export const API_URL_PATTERN = /^https?:\/\/[^/]*\/api\/v1\//;

/** Attach the mock API to a page. Call once after the page is created. */
export async function registerMockApi(page: import('@playwright/test').Page): Promise<void> {
  await page.route(API_URL_PATTERN, handleMockApi);
}
