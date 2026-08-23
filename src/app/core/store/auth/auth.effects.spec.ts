import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngrx/store';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, firstValueFrom } from 'rxjs';
import { Action } from '@ngrx/store';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';

@Component({ standalone: true, template: '' })
class StubDashboardComponent {}

@Component({ standalone: true, template: '' })
class StubLoginComponent {}

import { AuthEffects } from './auth.effects';
import { AuthService } from '../../services/auth.service';
import { WalletService } from '../../services/wallet.service';
import { WebsocketService } from '../../services/websocket.service';
import { NotificationService } from '../../services/notification.service';
import { SessionBusService } from '../../services/session-bus.service';
import { ApiService } from '../../services/api.service';
import { PwaService } from '../../services/pwa.service';
import * as AuthActions from './auth.actions';
import { reducers } from '../app.state';
import { UserRole } from '../../models/user.model';
import { STORAGE_KEYS } from '../../constants/app.constants';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const mockUser = {
  id: 'u1',
  wallet: 'GABC123',
  role: UserRole.BUYER,
  isKycVerified: false,
  isActive: true,
  createdAt: '',
  updatedAt: '',
};

const mockToken = 'jwt.mock.token';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AuthEffects', () => {
  let effects: AuthEffects;
  let actions$: Subject<Action>;
  let router: Router;

  const authServiceMock = {
    requestChallenge: vi.fn(),
    loginWithCreds: vi.fn(),
    register: vi.fn(),
    fetchCurrentUser: vi.fn(),
  };

  const walletServiceMock = {
    connect: vi.fn(),
    disconnect: vi.fn(),
    signChallenge: vi.fn(),
  };

  const wsServiceMock = {
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  const notificationServiceMock = {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  };

  const apiServiceMock = {
    setTokenProvider: vi.fn(),
  };

  const pwaServiceMock = {
    clearDataCaches: vi.fn(),
  };

  beforeEach(() => {
    actions$ = new Subject<Action>();
    vi.clearAllMocks();

    // Clean localStorage between tests
    localStorage.clear();

    TestBed.configureTestingModule({
      providers: [
        AuthEffects,
        provideRouter([
          { path: 'dashboard', component: StubDashboardComponent },
          { path: 'auth/login', component: StubLoginComponent },
        ]),
        provideStore(reducers),
        provideMockActions(() => actions$),
        { provide: AuthService, useValue: authServiceMock },
        { provide: WalletService, useValue: walletServiceMock },
        { provide: WebsocketService, useValue: wsServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: ApiService, useValue: apiServiceMock },
        { provide: PwaService, useValue: pwaServiceMock },
        SessionBusService,
      ],
    });

    effects = TestBed.inject(AuthEffects);
    router = TestBed.inject(Router);

    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  // ── Session rehydration ──────────────────────────────────────────────────────

  describe('rehydrateSession$', () => {
    it('emits sessionReady when no token is in localStorage', async () => {
      const resultPromise = firstValueFrom(effects.rehydrateSession$);
      actions$.next(AuthActions.rehydrateSession());
      const action = await resultPromise;

      expect(action).toEqual(AuthActions.sessionReady());
    });

    it('emits loginSuccess when token exists and /users/me succeeds', async () => {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, mockToken);
      authServiceMock.fetchCurrentUser.mockResolvedValue(mockUser);

      const resultPromise = firstValueFrom(effects.rehydrateSession$);
      actions$.next(AuthActions.rehydrateSession());
      const action = await resultPromise;

      expect(action).toEqual(AuthActions.loginSuccess({ user: mockUser, token: mockToken }));
    });

    it('emits sessionReady and clears localStorage when token exists but /users/me fails', async () => {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, mockToken);
      authServiceMock.fetchCurrentUser.mockRejectedValue(new Error('401'));

      const resultPromise = firstValueFrom(effects.rehydrateSession$);
      actions$.next(AuthActions.rehydrateSession());
      const action = await resultPromise;

      expect(action).toEqual(AuthActions.sessionReady());
      expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
    });
  });

  // ── loginSuccess$ side effects ────────────────────────────────────────────────

  describe('loginSuccess$', () => {
    it('writes token to localStorage and navigates to /dashboard', async () => {
      const resultPromise = firstValueFrom(effects.loginSuccess$);
      actions$.next(AuthActions.loginSuccess({ user: mockUser, token: mockToken }));
      await resultPromise;

      expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBe(mockToken);
      expect(router.navigateByUrl).toHaveBeenCalledWith('/dashboard');
    });

    it('opens the WebSocket connection with the user token and ID', async () => {
      const resultPromise = firstValueFrom(effects.loginSuccess$);
      actions$.next(AuthActions.loginSuccess({ user: mockUser, token: mockToken }));
      await resultPromise;

      expect(wsServiceMock.connect).toHaveBeenCalledWith(mockToken, mockUser.id);
    });
  });

  // ── logout$ side effects ────────────────────────────────────────────────────

  describe('logout$', () => {
    it('clears localStorage, disconnects wallet, closes WebSocket, shows info toast, navigates to /auth/login', async () => {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, mockToken);

      const resultPromise = firstValueFrom(effects.logout$);
      actions$.next(AuthActions.logout());
      await resultPromise;

      expect(localStorage.getItem(STORAGE_KEYS.AUTH_TOKEN)).toBeNull();
      expect(walletServiceMock.disconnect).toHaveBeenCalled();
      expect(wsServiceMock.disconnect).toHaveBeenCalled();
      expect(pwaServiceMock.clearDataCaches).toHaveBeenCalled();
      expect(notificationServiceMock.info).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });

    it('shows a warning toast (not info) for force-logout and closes WebSocket', async () => {
      localStorage.setItem(STORAGE_KEYS.AUTH_TOKEN, mockToken);

      const resultPromise = firstValueFrom(effects.logout$);
      actions$.next(AuthActions.forceLogout());
      await resultPromise;

      expect(notificationServiceMock.warning).toHaveBeenCalled();
      expect(notificationServiceMock.info).not.toHaveBeenCalled();
      expect(wsServiceMock.disconnect).toHaveBeenCalled();
      expect(pwaServiceMock.clearDataCaches).toHaveBeenCalled();
      expect(router.navigateByUrl).toHaveBeenCalledWith('/auth/login');
    });
  });

  // ── ngrxOnInitEffects ────────────────────────────────────────────────────────

  describe('ngrxOnInitEffects', () => {
    it('registers the token provider on ApiService', () => {
      effects.ngrxOnInitEffects();
      expect(apiServiceMock.setTokenProvider).toHaveBeenCalledWith(expect.any(Function));
    });

    it('returns the rehydrateSession action', () => {
      const action = effects.ngrxOnInitEffects();
      expect(action).toEqual(AuthActions.rehydrateSession());
    });
  });
});
