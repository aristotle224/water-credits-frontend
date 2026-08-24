import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { from } from 'rxjs';
import { filter, map, switchMap } from 'rxjs/operators';
import { concatLatestFrom } from '@ngrx/operators';

import * as AuthActions from '../auth/auth.actions';
import * as WalletActions from './wallet.actions';
import { WalletService } from '../../services/wallet.service';
import { selectWalletAddress } from './wallet.selectors';
import { AppState } from '../app.state';

/**
 * WalletEffects — reacts to auth lifecycle events and external wallet changes
 * to keep WalletState in sync.
 *
 * Responsibilities:
 *   1. Rehydration: on `loginSuccess`, check whether the active provider is
 *      already connected and populate `WalletState.address` if so.
 *      Also restores the `selectedProvider` slice from the registry's
 *      localStorage value (so the picker shows the right wallet after reload).
 *   2. Logout cleanup: clear `WalletState.address` on logout / forceLogout.
 *   3. External account switch: forward `walletService.addressChange$` events
 *      to `connectWalletSuccess` so the address stays current mid-session.
 *
 * What this class does NOT do:
 *   - It does not call `WalletService.selectProvider()` — that is the
 *     component's job (before the `connectWallet` action is dispatched).
 *   - It does not duplicate the `connectWalletSuccess` dispatch in
 *     `AuthEffects.login$` / `register$`; those still cover the initial
 *     connect before the challenge round-trip.
 */
@Injectable()
export class WalletEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store<AppState>);
  private readonly walletService = inject(WalletService);

  /**
   * On every `loginSuccess` (fresh login AND rehydrated session), attempt to
   * read the connected address from the active provider and populate
   * `WalletState`.  Also dispatches `selectWalletProvider` so the reducer's
   * `selectedProvider` slice reflects the value read from localStorage.
   *
   * Guard: skip when `WalletState.address` is already set — this prevents a
   * redundant dispatch when `AuthEffects.login$` has already done it.
   */
  rehydrateWalletOnLogin$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.loginSuccess),
      concatLatestFrom(() => this.store.select(selectWalletAddress)),
      filter(([, currentAddress]) => currentAddress === null),
      switchMap(() =>
        from(this.walletService.checkConnection()).pipe(
          map((isConnected) => {
            const providerType = this.walletService.getActiveProviderType();
            const actions: (
              | ReturnType<typeof WalletActions.connectWalletSuccess>
              | ReturnType<typeof WalletActions.selectWalletProvider>
            )[] = [WalletActions.selectWalletProvider({ providerType })];

            if (isConnected) {
              const address = this.walletService.getStoredPublicKey();
              if (address) {
                actions.push(WalletActions.connectWalletSuccess({ address }));
              }
            }
            return actions;
          }),
          // Flatten the array of actions into individual emissions.
          switchMap((actionsArray) => from(actionsArray)),
        ),
      ),
    ),
  );

  /**
   * On `logout` or `forceLogout`, dispatch `disconnectWallet` to clear
   * `WalletState.address`.
   */
  clearWalletOnLogout$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.logout, AuthActions.forceLogout),
      map(() => WalletActions.disconnectWallet()),
    ),
  );

  /**
   * Listens for mid-session account switches from the active wallet extension.
   * Updates `WalletState.address` so subsequent signing uses the correct key.
   */
  syncAddressChange$ = createEffect(() =>
    this.walletService.addressChange$.pipe(
      map((address) => WalletActions.connectWalletSuccess({ address })),
    ),
  );
}
