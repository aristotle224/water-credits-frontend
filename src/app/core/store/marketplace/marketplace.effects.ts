import { inject, Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, from } from 'rxjs';
import { switchMap, exhaustMap, map, catchError, tap } from 'rxjs/operators';

import * as MarketplaceActions from './marketplace.actions';
import { MarketplaceService } from '../../services/marketplace.service';
import { WalletService } from '../../services/wallet.service';
import { NotificationService } from '../../services/notification.service';
import { getApiError } from '../../models/api-error.model';
import { getErrorMessage } from '../../utils/error.utils';
import { isUserDeclined, extractSigningError } from '../../utils/wallet-tx.utils';

@Injectable()
export class MarketplaceEffects {
  private readonly actions$ = inject(Actions);
  private readonly marketplaceService = inject(MarketplaceService);
  private readonly walletService = inject(WalletService);
  private readonly notificationService = inject(NotificationService);
  private readonly router = inject(Router);

  /** switchMap cancels any in-flight listings request on filter/page change. */
  loadListings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketplaceActions.loadListings),
      switchMap(({ params }) =>
        from(this.marketplaceService.getListings(params)).pipe(
          map((response) => MarketplaceActions.loadListingsSuccess({ response })),
          catchError((err) =>
            of(
              MarketplaceActions.loadListingsFailure({
                error: err instanceof Error ? err.message : 'Failed to load listings',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * switchMap: if the user navigates away and comes back to a different
   * project, the previous order-book request is cancelled.
   */
  loadOrderBook$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketplaceActions.loadOrderBook),
      switchMap(({ projectId }) =>
        from(this.marketplaceService.getOrderBook(projectId)).pipe(
          map((orderBook) => MarketplaceActions.loadOrderBookSuccess({ orderBook })),
          catchError((err) =>
            of(
              MarketplaceActions.loadOrderBookFailure({
                error: err instanceof Error ? err.message : 'Failed to load order book',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  /**
   * exhaustMap: prevents duplicate listing submissions if the user clicks
   * "Create Listing" twice while the request is in flight.
   */
  createListing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketplaceActions.createListing),
      exhaustMap(({ data }) =>
        from(this.marketplaceService.createListing(data)).pipe(
          map((listing) => MarketplaceActions.createListingSuccess({ listing })),
          catchError((err) =>
            of(MarketplaceActions.createListingFailure(describeCreateListingError(err))),
          ),
        ),
      ),
    ),
  );

  createListingSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.createListingSuccess),
        tap(() => {
          this.notificationService.success('Listing created', 'Your listing is now live');
          this.router.navigate(['/marketplace']);
        }),
      ),
    { dispatch: false },
  );

  createListingFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.createListingFailure),
        tap(({ error }) => {
          this.notificationService.error('Failed to create listing', error);
        }),
      ),
    { dispatch: false },
  );

  /**
   * PRIMARY BUY FLOW — mirrors RetirementEffects.initiateRetirement$.
   *
   * exhaustMap is intentional: if the user double-clicks "Confirm Purchase"
   * the second dispatch is dropped until the first completes, preventing a
   * duplicate on-chain submission.
   *
   * Sequence:
   *   1. POST /marketplace/listings/:id/buy    → pending purchase + optional unsigned XDR
   *   2. WalletService.signTx(xdr)              → Freighter prompt (skipped if no XDR)
   *   3. POST /marketplace/listings/:id/submit  → broadcast signed XDR (skipped if no XDR)
   *   4. Dispatch buyConfirmed
   */
  initiateBuy$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketplaceActions.initiateBuy),
      exhaustMap(({ listingId }) =>
        from(this.marketplaceService.buyListing(listingId)).pipe(
          switchMap(async (prepareResponse) => {
            const { listing, unsignedXdr, networkPassphrase } = prepareResponse;

            // ── Legacy single-POST path (no XDR) ─────────────────────────────
            if (!unsignedXdr) {
              return MarketplaceActions.buyConfirmed({ listing });
            }

            // ── Two-phase path: sign the XDR ──────────────────────────────────
            let signedXdr: string | null;
            try {
              signedXdr = await this.walletService.signTx(
                unsignedXdr,
                'STELLAR',
                networkPassphrase,
              );
            } catch (sigErr) {
              if (isUserDeclined(sigErr)) {
                return MarketplaceActions.buySignatureRejected({ listingId: listing.id });
              }
              return MarketplaceActions.buySignatureFailure({
                listingId: listing.id,
                error: extractSigningError(sigErr),
              });
            }

            // signTx returns null when Freighter returns no XDR (edge case)
            if (!signedXdr) {
              return MarketplaceActions.buySignatureRejected({ listingId: listing.id });
            }

            // ── Submit signed XDR ─────────────────────────────────────────────
            try {
              const confirmed = await this.marketplaceService.submitPurchase({
                listingId: listing.id,
                signedXdr,
              });
              return MarketplaceActions.buyConfirmed({ listing: confirmed });
            } catch (submitErr) {
              const message = submitErr instanceof Error ? submitErr.message : 'Submission failed';
              return MarketplaceActions.buySubmitFailure({
                listingId: listing.id,
                error: message,
              });
            }
          }),
          catchError((err) => {
            const message = err instanceof Error ? err.message : 'Failed to prepare purchase';
            return of(MarketplaceActions.buyPrepareFailure({ error: message }));
          }),
        ),
      ),
    ),
  );

  /**
   * On confirmed purchase:
   *   - Show a success toast.
   *   - Leave listings and portfolio refreshes to CacheInvalidationEffects,
   *     which preserves the current listings pagination.
   */
  buyConfirmed$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.buyConfirmed),
        tap(({ listing }) => {
          this.notificationService.success(
            'Purchase complete',
            `Successfully purchased ${listing.amount} credits from ${listing.projectName}`,
          );
        }),
      ),
    { dispatch: false },
  );

  /**
   * When the user cancels the Freighter prompt, return the buy page to the
   * review step with a non-error informational toast (not an error state).
   */
  buySignatureRejected$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.buySignatureRejected),
        tap(() => {
          this.notificationService.info(
            'Signing cancelled',
            'You cancelled the wallet signing prompt. Your purchase was not submitted.',
          );
        }),
      ),
    { dispatch: false },
  );

  /** Show an error toast when Freighter fails for a reason other than user decline. */
  buySignatureFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.buySignatureFailure),
        tap(({ error }) => {
          this.notificationService.error('Signing failed', error);
        }),
      ),
    { dispatch: false },
  );

  /** Show an error toast on submit failure (backend 5xx after signing). */
  buySubmitFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.buySubmitFailure),
        tap(({ error }) => {
          this.notificationService.error('Purchase failed', error);
        }),
      ),
    { dispatch: false },
  );

  /** Show an error toast when the prepare step fails (e.g. insufficient balance). */
  buyPrepareFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.buyPrepareFailure),
        tap(({ error }) => {
          this.notificationService.error('Purchase failed', error);
        }),
      ),
    { dispatch: false },
  );

  /**
   * exhaustMap: prevents duplicate cancel requests if the user clicks
   * "Cancel Listing" twice while the request is in flight.
   */
  cancelListing$ = createEffect(() =>
    this.actions$.pipe(
      ofType(MarketplaceActions.cancelListing),
      exhaustMap(({ listingId }) =>
        from(this.marketplaceService.cancelListing(listingId)).pipe(
          map(() => MarketplaceActions.cancelListingSuccess({ listingId })),
          catchError((err) =>
            of(
              MarketplaceActions.cancelListingFailure({
                error: err instanceof Error ? err.message : 'Failed to cancel listing',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  cancelListingSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.cancelListingSuccess),
        tap(() => {
          this.notificationService.success('Listing cancelled', 'Your listing has been cancelled');
          this.router.navigate(['/marketplace']);
        }),
      ),
    { dispatch: false },
  );

  cancelListingFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(MarketplaceActions.cancelListingFailure),
        tap(({ error }) => {
          this.notificationService.error('Failed to cancel listing', error);
        }),
      ),
    { dispatch: false },
  );
}

/**
 * Turn a failed POST /marketplace/listings into a user-facing message, using
 * the HTTP status preserved by ApiService's ApiError normalisation.
 *
 * 422 carries per-field validation messages, so the offending field is passed
 * through to the form which renders it inline against that input.
 */
function describeCreateListingError(err: unknown): { error: string; field?: string } {
  const apiError = getApiError(err);

  switch (apiError?.status) {
    case 422: {
      const fieldError = apiError.firstFieldError();
      return fieldError
        ? { error: fieldError.message, field: fieldError.field }
        : { error: apiError.message };
    }
    case 403:
      return { error: 'You are not allowed to list credits for this project.' };
    case 409:
      return {
        error: 'These credits are already listed or no longer available to sell.',
        field: 'amount',
      };
    default:
      return { error: getErrorMessage(err, 'Failed to create listing') };
  }
}
