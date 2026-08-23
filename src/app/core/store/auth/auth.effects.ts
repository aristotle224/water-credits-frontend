import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType, OnInitEffects } from '@ngrx/effects';
import { Action, Store } from '@ngrx/store';
import { switchMap, tap, exhaustMap, filter, take } from 'rxjs/operators';
import { from } from 'rxjs';
import * as AuthActions from './auth.actions';
import { AuthService } from '../../services/auth.service';
import { WalletService } from '../../services/wallet.service';
import { WebsocketService } from '../../services/websocket.service';
import { NotificationService } from '../../services/notification.service';
import { SessionBusService } from '../../services/session-bus.service';
import { ApiService } from '../../services/api.service';
import { PwaService } from '../../services/pwa.service';
import { Router } from '@angular/router';
import { connectWalletSuccess } from '../wallet/wallet.actions';
import { selectAuthToken } from './auth.selectors';
import { STORAGE_KEYS } from '../../constants/app.constants';
import { AppState } from '../app.state';

@Injectable()
export class AuthEffects implements OnInitEffects {
  private readonly actions$ = inject(Actions);
  private readonly store = inject(Store<AppState>);
  private readonly authService = inject(AuthService);
  private readonly walletService = inject(WalletService);
  private readonly wsService = inject(WebsocketService);
  private readonly notificationService = inject(NotificationService);
  private readonly sessionBus = inject(SessionBusService);
  private readonly apiService = inject(ApiService);
  private readonly pwaService = inject(PwaService);
  private readonly router = inject(Router);

  /**
   * OnInitEffects: called once when the effects class is registered.
   * We use it to:
   *   1. Register the token provider on ApiService (store → no circular dep).
   *   2. Kick off session rehydration.
   */
  ngrxOnInitEffects(): Action {
    // Wire the store token into the API layer.  selectSignal gives a
    // synchronous accessor that the axios interceptor can call per-request.
    const tokenSignal = this.store.selectSignal(selectAuthToken);
    this.apiService.setTokenProvider(() => tokenSignal());

    return AuthActions.rehydrateSession();
  }

  // ── Session rehydration ──────────────────────────────────────────────────

  /**
   * On app start, check localStorage for a persisted token.  If one exists,
   * try to fetch the current user.  On success, dispatch loginSuccess to
   * populate the store.  On any failure (expired token, network, etc.),
   * clear storage and dispatch sessionReady so guards do not wait forever.
   */
  rehydrateSession$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.rehydrateSession),
      switchMap(async () => {
        const token = localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN);
        if (!token) {
          return AuthActions.sessionReady();
        }
        try {
          const user = await this.authService.fetchCurrentUser();
          // loginSuccess sets sessionReady = true in the reducer
          return AuthActions.loginSuccess({ user, token });
        } catch {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          return AuthActions.sessionReady();
        }
      }),
    ),
  );

  // ── Login ────────────────────────────────────────────────────────────────

  login$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.login),
      exhaustMap(async () => {
        try {
          const wallet = await this.walletService.connect();
          if (!wallet) throw new Error('Wallet connection failed');
          this.store.dispatch(connectWalletSuccess({ address: wallet }));
          const { challenge } = await this.authService.requestChallenge(wallet);
          const signature = await this.walletService.signChallenge(challenge);
          if (!signature) throw new Error('Signature failed');
          const result = await this.authService.loginWithCreds(wallet, signature, challenge);
          return AuthActions.loginSuccess({ user: result.user, token: result.token });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Login failed';
          return AuthActions.loginFailure({ error: message });
        }
      }),
    ),
  );

  loginSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginSuccess),
        tap(({ user, token }) => {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          // Open the WebSocket connection now that we have a valid JWT and
          // user ID.  We use user.id (internal DB identifier) rather than
          // the wallet address because the wallet address may be null on
          // the WalletState after a reload (Issue 3 — tracked separately).
          // connect() safely disconnects any pre-existing socket first.
          //
          // TODO: if the JWT is silently refreshed mid-session the socket's
          // auth handshake token will become stale.  A future fix should
          // either reconnect the socket after token refresh or use a
          // short-lived handshake token.  Tracked in a follow-up issue.
          this.wsService.connect(token, user.id);
          this.notificationService.success(
            'Welcome!',
            `Signed in as ${user.displayName || user.wallet}`,
          );
          this.router.navigateByUrl('/dashboard');
        }),
      ),
    { dispatch: false },
  );

  loginFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.loginFailure),
        tap(({ error }) => {
          this.notificationService.error('Login failed', error);
        }),
      ),
    { dispatch: false },
  );

  // ── Register ─────────────────────────────────────────────────────────────

  register$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.register),
      exhaustMap(async ({ email, displayName }) => {
        try {
          const wallet = await this.walletService.connect();
          if (!wallet) throw new Error('Wallet connection failed');
          this.store.dispatch(connectWalletSuccess({ address: wallet }));
          const { challenge } = await this.authService.requestChallenge(wallet);
          const signature = await this.walletService.signChallenge(challenge);
          if (!signature) throw new Error('Signature failed');
          const result = await this.authService.register(
            wallet,
            email || undefined,
            displayName || undefined,
          );
          return AuthActions.registerSuccess({ user: result.user, token: result.token });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Registration failed';
          return AuthActions.registerFailure({ error: message });
        }
      }),
    ),
  );

  registerSuccess$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.registerSuccess),
        tap(({ user, token }) => {
          localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
          this.notificationService.success(
            'Account created',
            `Welcome, ${user.displayName || user.wallet}!`,
          );
          this.router.navigateByUrl('/dashboard');
        }),
      ),
    { dispatch: false },
  );

  registerFailure$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.registerFailure),
        tap(({ error }) => {
          this.notificationService.error('Registration failed', error);
        }),
      ),
    { dispatch: false },
  );

  // ── Logout ────────────────────────────────────────────────────────────────

  /**
   * Handles both user-initiated logout and force-logout triggered by a 401.
   * This is the single code path that clears storage, disconnects the wallet,
   * closes the WebSocket connection, shows a notification, and redirects to
   * the login page.
   */
  logout$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(AuthActions.logout, AuthActions.forceLogout),
        tap((action) => {
          localStorage.removeItem(STORAGE_KEYS.AUTH_TOKEN);
          this.walletService.disconnect();
          this.wsService.disconnect();
          this.pwaService.clearDataCaches();
          if (action.type === AuthActions.forceLogout.type) {
            this.notificationService.warning('Session expired', 'Please sign in again');
          } else {
            this.notificationService.info('Logged out', 'You have been signed out');
          }
          this.router.navigateByUrl('/auth/login');
        }),
      ),
    { dispatch: false },
  );

  // ── 401 event bus → forceLogout ───────────────────────────────────────────

  /**
   * Listens on the SessionBusService subject.  When a 401 is received,
   * dispatch forceLogout only if the user is currently authenticated
   * (avoid duplicate dispatches during unauthenticated requests).
   */
  forceLogout$ = createEffect(() =>
    from(this.sessionBus.forceLogout$).pipe(
      // Filter out 401s that arrive before session is established
      // (e.g. background requests on the login page itself).
      switchMap(() =>
        this.store.select(selectAuthToken).pipe(
          take(1),
          filter((token): token is string => token !== null),
          switchMap(() => [AuthActions.forceLogout()]),
        ),
      ),
    ),
  );

  // ── Current user ──────────────────────────────────────────────────────────

  getCurrentUser$ = createEffect(() =>
    this.actions$.pipe(
      ofType(AuthActions.getCurrentUser),
      switchMap(async () => {
        try {
          const user = await this.authService.fetchCurrentUser();
          return AuthActions.getCurrentUserSuccess({ user });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to fetch user';
          return AuthActions.getCurrentUserFailure({ error: message });
        }
      }),
    ),
  );
}
