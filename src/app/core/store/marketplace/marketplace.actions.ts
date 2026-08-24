import { createAction, props } from '@ngrx/store';
import { MarketplaceListing, OrderBook } from '../../services/marketplace.service';
import { PaginatedResponse } from '../../models/pagination.model';

// ─── Load Listings ────────────────────────────────────────────────────────────

export const loadListings = createAction(
  '[Marketplace] Load Listings',
  props<{
    params?: {
      page?: number;
      limit?: number;
      status?: string;
      projectId?: string;
      search?: string;
    };
  }>(),
);

export const loadListingsSuccess = createAction(
  '[Marketplace] Load Listings Success',
  props<{ response: PaginatedResponse<MarketplaceListing> }>(),
);

export const loadListingsFailure = createAction(
  '[Marketplace] Load Listings Failure',
  props<{ error: string }>(),
);

// ─── Load Order Book ──────────────────────────────────────────────────────────

export const loadOrderBook = createAction(
  '[Marketplace] Load Order Book',
  props<{ projectId: string }>(),
);

export const loadOrderBookSuccess = createAction(
  '[Marketplace] Load Order Book Success',
  props<{ orderBook: OrderBook }>(),
);

export const loadOrderBookFailure = createAction(
  '[Marketplace] Load Order Book Failure',
  props<{ error: string }>(),
);

// ─── Create Listing ───────────────────────────────────────────────────────────

export const createListing = createAction(
  '[Marketplace] Create Listing',
  props<{ data: { projectId: string; amount: string; price: number; expiresAt?: string } }>(),
);

export const createListingSuccess = createAction(
  '[Marketplace] Create Listing Success',
  props<{ listing: MarketplaceListing }>(),
);

/**
 * `field` is set when the server returned a field-level validation error
 * (HTTP 422) — the create-listing form uses it to render the message inline
 * against the offending input instead of only firing a generic toast.
 */
export const createListingFailure = createAction(
  '[Marketplace] Create Listing Failure',
  props<{ error: string; field?: string }>(),
);

// ─── Buy Listing ──────────────────────────────────────────────────────────────
// Two-phase flow mirroring RetirementActions: prepare (backend creates the
// unsigned XDR) -> Freighter signing -> submit. See MarketplaceEffects.initiateBuy$.

/** Dispatched by MarketplaceBuyComponent when the user clicks "Confirm Purchase". */
export const initiateBuy = createAction(
  '[Marketplace] Initiate Buy',
  props<{ listingId: string }>(),
);

export const buyPrepareFailure = createAction(
  '[Marketplace] Buy Prepare Failure',
  props<{ error: string }>(),
);

/**
 * Emitted when the user explicitly rejects the Freighter signing prompt.
 * This is NOT an error; the buy page returns to the review step.
 */
export const buySignatureRejected = createAction(
  '[Marketplace] Buy Signature Rejected',
  props<{ listingId: string }>(),
);

export const buySignatureFailure = createAction(
  '[Marketplace] Buy Signature Failure',
  props<{ listingId: string; error: string }>(),
);

export const buySubmitFailure = createAction(
  '[Marketplace] Buy Submit Failure',
  props<{ listingId: string; error: string }>(),
);

/** Terminal success action. Emitted once the backend confirms the purchase. */
export const buyConfirmed = createAction(
  '[Marketplace] Buy Confirmed',
  props<{ listing: MarketplaceListing }>(),
);

// ─── Cancel Listing ───────────────────────────────────────────────────────────

/** Dispatched by the listing owner to withdraw an active listing. */
export const cancelListing = createAction(
  '[Marketplace] Cancel Listing',
  props<{ listingId: string }>(),
);

export const cancelListingSuccess = createAction(
  '[Marketplace] Cancel Listing Success',
  props<{ listingId: string }>(),
);

export const cancelListingFailure = createAction(
  '[Marketplace] Cancel Listing Failure',
  props<{ error: string }>(),
);

// ─── Set Filters ──────────────────────────────────────────────────────────────

export const setListingsFilters = createAction(
  '[Marketplace] Set Filters',
  props<{ status?: string; projectId?: string; search?: string }>(),
);

export const setListingsPage = createAction('[Marketplace] Set Page', props<{ page: number }>());
