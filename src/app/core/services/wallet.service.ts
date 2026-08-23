import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { switchMap, distinctUntilChanged } from 'rxjs/operators';
import { WalletProviderRegistry } from './wallet/wallet-provider.registry';
import { WalletProviderType } from './wallet/wallet.provider';
import { LoggingService } from './logging.service';

/**
 * WalletService — the single point of entry for all wallet operations.
 *
 * This service delegates every call to the currently-active `WalletProvider`.
 * Application code (effects, components) should always interact with
 * `WalletService`, never with a concrete provider directly.
 *
 * Provider switching:
 *   Call `selectProvider(type)` before initiating a new connection.
 *   The choice is persisted by the registry to `localStorage` so it
 *   survives page reloads.
 *
 * The public `addressChange$` and `networkChange$` Observables track the
 * active provider and re-subscribe whenever the provider changes, so
 * `WalletEffects.syncAddressChange$` continues to work without modification.
 */
@Injectable({
  providedIn: 'root',
})
export class WalletService {
  private readonly publicKeySubject = new BehaviorSubject<string | null>(null);
  readonly publicKey$ = this.publicKeySubject.asObservable();

  /**
   * Tracks which provider type is currently active.  Emitting a new value
   * causes `addressChange$` and `networkChange$` to re-subscribe to the new
   * provider's observables.
   */
  private readonly activeProviderType$: BehaviorSubject<WalletProviderType>;

  /**
   * Emits the public key whenever the user switches Stellar accounts in the
   * active wallet mid-session.  Delegates to the active provider's
   * `addressChange$`; automatically re-subscribes when the provider changes.
   */
  readonly addressChange$: Observable<string>;

  /**
   * Emits the network name whenever the user switches networks in the active
   * wallet mid-session.  Delegates to the active provider's `networkChange$`.
   */
  readonly networkChange$: Observable<string>;

  constructor(
    private readonly registry: WalletProviderRegistry,
    private readonly loggingService: LoggingService,
  ) {
    const storedType = this.registry.getStoredType() ?? 'freighter';
    this.activeProviderType$ = new BehaviorSubject<WalletProviderType>(storedType);

    this.addressChange$ = this.activeProviderType$.pipe(
      distinctUntilChanged(),
      switchMap((type) => this.registry.get(type).addressChange$),
    );

    this.networkChange$ = this.activeProviderType$.pipe(
      distinctUntilChanged(),
      switchMap((type) => this.registry.get(type).networkChange$),
    );
  }

  // ── Provider selection ────────────────────────────────────────────────────

  /**
   * Switches the active wallet provider.
   * Persists the choice to `localStorage` via the registry.
   * Does NOT connect automatically — the caller must call `connect()`.
   */
  selectProvider(type: WalletProviderType): void {
    this.registry.setActive(type);
    this.activeProviderType$.next(type);
    // Clear any cached key from the previous provider.
    this.publicKeySubject.next(null);
  }

  /** Returns the currently-active provider type. */
  getActiveProviderType(): WalletProviderType {
    return this.activeProviderType$.value;
  }

  // ── Connection ─────────────────────────────────────────────────────────────

  async checkConnection(): Promise<boolean> {
    try {
      const provider = this.registry.get(this.activeProviderType$.value);
      const address = await provider.checkConnection();
      if (address) {
        this.publicKeySubject.next(address);
        return true;
      }
    } catch (e) {
      this.loggingService.error('Wallet checkConnection failed', e);
    }
    return false;
  }

  async connect(): Promise<string | null> {
    try {
      const provider = this.registry.get(this.activeProviderType$.value);
      const address = await provider.connect();
      if (address) {
        this.publicKeySubject.next(address);
        return address;
      }
      return null;
    } catch (error) {
      this.loggingService.error('Wallet connect failed:', error);
      return null;
    }
  }

  async disconnect(): Promise<void> {
    try {
      const provider = this.registry.get(this.activeProviderType$.value);
      await provider.disconnect();
    } catch (e) {
      this.loggingService.error('Wallet disconnect failed', e);
    }
    this.publicKeySubject.next(null);
  }

  // ── Signing ───────────────────────────────────────────────────────────────

  async signChallenge(challenge: string): Promise<string | null> {
    try {
      const provider = this.registry.get(this.activeProviderType$.value);
      return await provider.signChallenge(challenge);
    } catch (error) {
      this.loggingService.error('Wallet signChallenge failed:', error);
      return null;
    }
  }

  /**
   * Signs a Stellar transaction XDR using the active wallet provider.
   *
   * **Re-throws** any error thrown by the provider so callers
   * (RetirementEffects, MarketplaceEffects, GovernanceEffects) can
   * distinguish user-declined rejections from genuine errors via
   * `isUserDeclined()` / `extractSigningError()`.
   */
  async signTx(xdr: string, network: string, networkPassphrase?: string): Promise<string | null> {
    const provider = this.registry.get(this.activeProviderType$.value);
    return provider.signTx(xdr, network, networkPassphrase);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getStoredPublicKey(): string | null {
    return this.publicKeySubject.value;
  }
}
