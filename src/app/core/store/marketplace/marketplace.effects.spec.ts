import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';
import { getEffectsMetadata } from '@ngrx/effects';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { Action } from '@ngrx/store';
import { provideRouter } from '@angular/router';

@Component({ standalone: true, template: '' })
class StubMarketplaceComponent {}

import { MarketplaceEffects } from './marketplace.effects';
import {
  MarketplaceService,
  MarketplaceListing,
  OrderBook,
  BuyPrepareResponse,
} from '../../services/marketplace.service';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import * as MarketplaceActions from './marketplace.actions';
import { ApiError } from '../../models/api-error.model';

/** Builds the ApiError that ApiService produces for a given HTTP failure. */
function apiError(status: number, data: unknown, message = 'Request failed'): ApiError {
  return new ApiError(message, {
    response: { status, statusText: '', data, headers: {} },
  });
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockListing: MarketplaceListing = {
  id: 'listing-001',
  projectId: 'proj-1',
  projectName: 'Green Valley',
  sellerId: 'user-1',
  amount: '5000',
  price: 2.5,
  totalValue: 12500,
  status: 'active',
  createdAt: new Date().toISOString(),
};

const mockPaginatedListings = {
  data: [mockListing],
  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
};

const mockOrderBook: OrderBook = {
  asks: [{ price: 3.0, amount: '1000', total: '3000', count: 1 }],
  bids: [{ price: 2.0, amount: '2000', total: '4000', count: 2 }],
};

const mockConfirmedPurchase: MarketplaceListing = { ...mockListing, status: 'filled' };

const mockUnsignedXdr = 'AAAAAQAA...base64xdr==';
const mockSignedXdr = 'AAAASIGN...base64xdr==';
const mockNetworkPassphrase = 'Test SDF Network ; September 2015';

const mockBuyPrepareResponseWithXdr: BuyPrepareResponse = {
  listing: mockListing,
  unsignedXdr: mockUnsignedXdr,
  networkPassphrase: mockNetworkPassphrase,
};

const mockBuyPrepareResponseLegacy: BuyPrepareResponse = {
  listing: mockConfirmedPurchase,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MarketplaceEffects', () => {
  let effects: MarketplaceEffects;
  let actions$: Subject<Action>;

  const marketplaceServiceMock = {
    getListings: vi.fn(),
    getOrderBook: vi.fn(),
    createListing: vi.fn(),
    cancelListing: vi.fn(),
    buyListing: vi.fn(),
    submitPurchase: vi.fn(),
  };

  const walletServiceMock = { signTx: vi.fn() };

  const notificationServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    vi.clearAllMocks();

    TestBed.configureTestingModule({
      providers: [
        MarketplaceEffects,
        provideRouter([{ path: 'marketplace', component: StubMarketplaceComponent }]),
        provideStore({}),
        provideMockActions(() => actions$),
        { provide: MarketplaceService, useValue: marketplaceServiceMock },
        { provide: WalletService, useValue: walletServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
      ],
    });

    effects = TestBed.inject(MarketplaceEffects);
  });

  // ── Load Listings ───────────────────────────────────────────────────────────

  describe('loadListings$', () => {
    it('emits loadListingsSuccess on success', async () => {
      marketplaceServiceMock.getListings.mockResolvedValue(mockPaginatedListings);

      const resultPromise = firstValueFrom(effects.loadListings$);
      actions$.next(MarketplaceActions.loadListings({}));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.loadListingsSuccess({ response: mockPaginatedListings }),
      );
      expect(marketplaceServiceMock.getListings).toHaveBeenCalled();
    });

    it('emits loadListingsFailure on error', async () => {
      marketplaceServiceMock.getListings.mockRejectedValue(new Error('Network error'));

      const resultPromise = firstValueFrom(effects.loadListings$);
      actions$.next(MarketplaceActions.loadListings({}));
      const action = await resultPromise;

      expect(action).toEqual(MarketplaceActions.loadListingsFailure({ error: 'Network error' }));
    });

    it('passes filters to the service', async () => {
      marketplaceServiceMock.getListings.mockResolvedValue(mockPaginatedListings);

      const resultPromise = firstValueFrom(effects.loadListings$);
      actions$.next(
        MarketplaceActions.loadListings({ params: { status: 'active', page: 2, limit: 10 } }),
      );
      await resultPromise;

      expect(marketplaceServiceMock.getListings).toHaveBeenCalledWith({
        status: 'active',
        page: 2,
        limit: 10,
      });
    });
  });

  // ── Load Order Book ─────────────────────────────────────────────────────────

  describe('loadOrderBook$', () => {
    it('emits loadOrderBookSuccess on success', async () => {
      marketplaceServiceMock.getOrderBook.mockResolvedValue(mockOrderBook);

      const resultPromise = firstValueFrom(effects.loadOrderBook$);
      actions$.next(MarketplaceActions.loadOrderBook({ projectId: 'proj-1' }));
      const action = await resultPromise;

      expect(action).toEqual(MarketplaceActions.loadOrderBookSuccess({ orderBook: mockOrderBook }));
      expect(marketplaceServiceMock.getOrderBook).toHaveBeenCalledWith('proj-1');
    });

    it('emits loadOrderBookFailure on error', async () => {
      marketplaceServiceMock.getOrderBook.mockRejectedValue(new Error('Failed'));

      const resultPromise = firstValueFrom(effects.loadOrderBook$);
      actions$.next(MarketplaceActions.loadOrderBook({ projectId: 'proj-1' }));
      const action = await resultPromise;

      expect(action).toEqual(MarketplaceActions.loadOrderBookFailure({ error: 'Failed' }));
    });
  });

  // ── Create Listing ──────────────────────────────────────────────────────────

  describe('createListing$', () => {
    it('emits createListingSuccess on success', async () => {
      marketplaceServiceMock.createListing.mockResolvedValue(mockListing);

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(MarketplaceActions.createListingSuccess({ listing: mockListing }));
    });

    it('emits createListingFailure on error', async () => {
      marketplaceServiceMock.createListing.mockRejectedValue(new Error('Insufficient balance'));

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.createListingFailure({ error: 'Insufficient balance' }),
      );
    });

    it('surfaces the offending field from a 422 validation response', async () => {
      marketplaceServiceMock.createListing.mockRejectedValue(
        apiError(422, {
          message: 'Validation failed',
          errors: { amount: ['must not exceed your available balance'] },
        }),
      );

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.createListingFailure({
          error: 'must not exceed your available balance',
          field: 'amount',
        }),
      );
    });

    it('maps a 409 conflict to a specific message on the amount field', async () => {
      marketplaceServiceMock.createListing.mockRejectedValue(
        apiError(409, { message: 'Conflict' }),
      );

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.createListingFailure({
          error: 'These credits are already listed or no longer available to sell.',
          field: 'amount',
        }),
      );
    });

    it('maps a 403 to an authorisation message with no field', async () => {
      marketplaceServiceMock.createListing.mockRejectedValue(
        apiError(403, { message: 'Forbidden' }),
      );

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.createListingFailure({
          error: 'You are not allowed to list credits for this project.',
        }),
      );
    });

    it('falls back to the server message for a 422 without field errors', async () => {
      marketplaceServiceMock.createListing.mockRejectedValue(
        apiError(422, { message: 'Listing window closed' }, 'Listing window closed'),
      );

      const resultPromise = firstValueFrom(effects.createListing$);
      actions$.next(
        MarketplaceActions.createListing({
          data: { projectId: 'proj-1', amount: '5000', price: 2.5 },
        }),
      );
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.createListingFailure({ error: 'Listing window closed' }),
      );
    });
  });

  // ── exhaustMap deduplication ────────────────────────────────────────────────

  describe('createListing$ — exhaustMap deduplication', () => {
    it('ignores a second dispatch while the first is in flight', async () => {
      let resolveFirst!: (v: MarketplaceListing) => void;
      const firstCallPromise = new Promise<MarketplaceListing>((res) => {
        resolveFirst = res;
      });

      marketplaceServiceMock.createListing
        .mockReturnValueOnce(firstCallPromise)
        .mockResolvedValue(mockListing);

      const resultPromise = firstValueFrom(effects.createListing$);

      const listingData = { projectId: 'proj-1', amount: '5000', price: 2.5 };
      actions$.next(MarketplaceActions.createListing({ data: listingData }));
      actions$.next(MarketplaceActions.createListing({ data: listingData }));

      await new Promise((r) => setTimeout(r, 10));
      resolveFirst(mockListing);
      await resultPromise;

      expect(marketplaceServiceMock.createListing).toHaveBeenCalledTimes(1);
    });
  });

  // ── Success side-effects ────────────────────────────────────────────────────

  describe('createListingSuccess$', () => {
    it('shows a success notification', async () => {
      const resultPromise = firstValueFrom(effects.createListingSuccess$);
      actions$.next(MarketplaceActions.createListingSuccess({ listing: mockListing }));
      await resultPromise;

      expect(notificationServiceMock.success).toHaveBeenCalledWith(
        'Listing created',
        'Your listing is now live',
      );
    });
  });

  describe('createListingFailure$', () => {
    it('shows an error notification', async () => {
      const resultPromise = firstValueFrom(effects.createListingFailure$);
      actions$.next(MarketplaceActions.createListingFailure({ error: 'Insufficient balance' }));
      await resultPromise;

      expect(notificationServiceMock.error).toHaveBeenCalledWith(
        'Failed to create listing',
        'Insufficient balance',
      );
    });
  });

  // ── Buy flow: happy path ────────────────────────────────────────────────────

  describe('initiateBuy$ — happy path (two-step flow)', () => {
    it('prepares, signs, submits, and emits buyConfirmed', async () => {
      marketplaceServiceMock.buyListing.mockResolvedValue(mockBuyPrepareResponseWithXdr);
      walletServiceMock.signTx.mockResolvedValue(mockSignedXdr);
      marketplaceServiceMock.submitPurchase.mockResolvedValue(mockConfirmedPurchase);

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(MarketplaceActions.buyConfirmed({ listing: mockConfirmedPurchase }));
      expect(marketplaceServiceMock.buyListing).toHaveBeenCalledWith(mockListing.id);
      expect(walletServiceMock.signTx).toHaveBeenCalledWith(
        mockUnsignedXdr,
        'STELLAR',
        mockNetworkPassphrase,
      );
      expect(marketplaceServiceMock.submitPurchase).toHaveBeenCalledWith({
        listingId: mockListing.id,
        signedXdr: mockSignedXdr,
      });
    });
  });

  describe('initiateBuy$ — legacy single-POST path (no XDR)', () => {
    it('skips signing and emits buyConfirmed directly', async () => {
      marketplaceServiceMock.buyListing.mockResolvedValue(mockBuyPrepareResponseLegacy);

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.buyConfirmed({ listing: mockBuyPrepareResponseLegacy.listing }),
      );
      expect(walletServiceMock.signTx).not.toHaveBeenCalled();
      expect(marketplaceServiceMock.submitPurchase).not.toHaveBeenCalled();
    });
  });

  // ── Buy flow: user declines Freighter prompt ────────────────────────────────

  describe('initiateBuy$ — user declines Freighter prompt', () => {
    it('emits buySignatureRejected (not an error action)', async () => {
      marketplaceServiceMock.buyListing.mockResolvedValue(mockBuyPrepareResponseWithXdr);
      walletServiceMock.signTx.mockRejectedValue(new Error('User declined the signing request'));

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.buySignatureRejected({ listingId: mockListing.id }),
      );
      expect(marketplaceServiceMock.submitPurchase).not.toHaveBeenCalled();
    });

    it('emits buySignatureRejected when signTx returns null', async () => {
      marketplaceServiceMock.buyListing.mockResolvedValue(mockBuyPrepareResponseWithXdr);
      walletServiceMock.signTx.mockResolvedValue(null);

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.buySignatureRejected({ listingId: mockListing.id }),
      );
    });

    it('shows an info notification and not an error', async () => {
      const resultPromise = firstValueFrom(effects.buySignatureRejected$);
      actions$.next(MarketplaceActions.buySignatureRejected({ listingId: mockListing.id }));
      await resultPromise;

      expect(notificationServiceMock.info).toHaveBeenCalledWith(
        'Signing cancelled',
        expect.any(String),
      );
      expect(notificationServiceMock.error).not.toHaveBeenCalled();
    });
  });

  // ── Buy flow: insufficient balance (prepare step fails) ─────────────────────

  describe('initiateBuy$ — insufficient balance', () => {
    it('emits buyPrepareFailure with the error message', async () => {
      marketplaceServiceMock.buyListing.mockRejectedValue(new Error('Insufficient balance'));

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.buyPrepareFailure({ error: 'Insufficient balance' }),
      );
    });

    it('shows an error notification', async () => {
      const resultPromise = firstValueFrom(effects.buyPrepareFailure$);
      actions$.next(MarketplaceActions.buyPrepareFailure({ error: 'Insufficient balance' }));
      await resultPromise;

      expect(notificationServiceMock.error).toHaveBeenCalledWith(
        'Purchase failed',
        'Insufficient balance',
      );
    });
  });

  // ── Buy flow: backend fails after signing ───────────────────────────────────

  describe('initiateBuy$ — backend fails after signing', () => {
    it('emits buySubmitFailure with the error message', async () => {
      marketplaceServiceMock.buyListing.mockResolvedValue(mockBuyPrepareResponseWithXdr);
      walletServiceMock.signTx.mockResolvedValue(mockSignedXdr);
      marketplaceServiceMock.submitPurchase.mockRejectedValue(new Error('Internal server error'));

      const resultPromise = firstValueFrom(effects.initiateBuy$);
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.buySubmitFailure({
          listingId: mockListing.id,
          error: 'Internal server error',
        }),
      );
    });
  });

  // ── Buy flow: exhaustMap deduplication ──────────────────────────────────────

  describe('initiateBuy$ — exhaustMap deduplication', () => {
    it('processes only the first dispatch and ignores the second while in flight', async () => {
      let resolveFirst!: (v: BuyPrepareResponse) => void;
      const firstCallPromise = new Promise<BuyPrepareResponse>((res) => {
        resolveFirst = res;
      });

      marketplaceServiceMock.buyListing
        .mockReturnValueOnce(firstCallPromise)
        .mockResolvedValue(mockBuyPrepareResponseLegacy);

      const resultPromise = firstValueFrom(effects.initiateBuy$);

      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));
      actions$.next(MarketplaceActions.initiateBuy({ listingId: mockListing.id }));

      await new Promise((r) => setTimeout(r, 10));
      resolveFirst(mockBuyPrepareResponseLegacy);

      await resultPromise;

      expect(marketplaceServiceMock.buyListing).toHaveBeenCalledTimes(1);
    });
  });

  // ── Buy flow: confirmed notification ────────────────────────────────────────

  describe('buyConfirmed$ — notification', () => {
    it('leaves cache refresh dispatching to CacheInvalidationEffects', () => {
      const metadata = getEffectsMetadata(effects);
      expect(metadata['buyConfirmed$']?.dispatch).toBe(false);
    });

    it('shows a success notification containing the amount', async () => {
      const resultPromise = firstValueFrom(effects.buyConfirmed$);
      actions$.next(MarketplaceActions.buyConfirmed({ listing: mockConfirmedPurchase }));
      await resultPromise;

      expect(notificationServiceMock.success).toHaveBeenCalledWith(
        'Purchase complete',
        expect.stringContaining('5000'),
      );
    });
  });

  // ── Cancel Listing ───────────────────────────────────────────────────────────

  describe('cancelListing$', () => {
    it('emits cancelListingSuccess on success', async () => {
      marketplaceServiceMock.cancelListing.mockResolvedValue(undefined);

      const resultPromise = firstValueFrom(effects.cancelListing$);
      actions$.next(MarketplaceActions.cancelListing({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.cancelListingSuccess({ listingId: mockListing.id }),
      );
      expect(marketplaceServiceMock.cancelListing).toHaveBeenCalledWith(mockListing.id);
    });

    it('emits cancelListingFailure on error', async () => {
      marketplaceServiceMock.cancelListing.mockRejectedValue(new Error('Not the listing owner'));

      const resultPromise = firstValueFrom(effects.cancelListing$);
      actions$.next(MarketplaceActions.cancelListing({ listingId: mockListing.id }));
      const action = await resultPromise;

      expect(action).toEqual(
        MarketplaceActions.cancelListingFailure({ error: 'Not the listing owner' }),
      );
    });
  });

  describe('cancelListingSuccess$', () => {
    it('shows a success notification', async () => {
      const resultPromise = firstValueFrom(effects.cancelListingSuccess$);
      actions$.next(MarketplaceActions.cancelListingSuccess({ listingId: mockListing.id }));
      await resultPromise;

      expect(notificationServiceMock.success).toHaveBeenCalledWith(
        'Listing cancelled',
        'Your listing has been cancelled',
      );
    });
  });

  describe('cancelListingFailure$', () => {
    it('shows an error notification', async () => {
      const resultPromise = firstValueFrom(effects.cancelListingFailure$);
      actions$.next(MarketplaceActions.cancelListingFailure({ error: 'Not the listing owner' }));
      await resultPromise;

      expect(notificationServiceMock.error).toHaveBeenCalledWith(
        'Failed to cancel listing',
        'Not the listing owner',
      );
    });
  });
});
