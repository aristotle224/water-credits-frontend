import freighter, { WatchWalletChanges } from '@stellar/freighter-api';
import { Observable, EMPTY } from 'rxjs';
import { distinctUntilChanged, filter } from 'rxjs/operators';
import { WalletProvider, WalletProviderType } from './wallet.provider';

/**
 * Minimal shape of the Freighter API functions used by this provider.
 * Kept internal so tests can supply a mock without module-level mocking.
 */
export interface FreighterApi {
  isConnected(): Promise<{ isConnected: boolean }>;
  getAddress(): Promise<{ address?: string }>;
  signMessage(msg: string): Promise<{ signedMessage?: string | Uint8Array }>;
  signTransaction(
    xdr: string,
    opts?: { networkPassphrase?: string },
  ): Promise<{ signedTxXdr?: string }>;
}

/**
 * FreighterWalletProvider — wraps the `@stellar/freighter-api` v6 SDK.
 *
 * The Freighter API object is accepted as a constructor parameter so that
 * tests can inject a plain mock without module-level mocking.
 * The default value is the real `freighter` singleton from the SDK.
 *
 * Notes:
 * - `signTx` deliberately **re-throws** so callers can use `isUserDeclined()`.
 * - `signChallenge` returns null on soft failure (no `signedMessage` in the
 *   response) to preserve backward-compat with `AuthEffects.login$`.
 */
export class FreighterWalletProvider implements WalletProvider {
  readonly type: WalletProviderType = 'freighter';
  readonly label = 'Freighter';

  readonly addressChange$: Observable<string>;
  readonly networkChange$: Observable<string>;

  constructor(private readonly api: FreighterApi = freighter as unknown as FreighterApi) {
    this.addressChange$ = this.buildAddressChangeObservable();
    this.networkChange$ = this.buildNetworkChangeObservable();
  }

  // ── WalletProvider contract ───────────────────────────────────────────────

  isAvailable(): boolean {
    try {
      return (
        typeof window !== 'undefined' &&
        !!(window as unknown as Record<string, unknown>)['freighterApi']
      );
    } catch {
      return false;
    }
  }

  async connect(): Promise<string | null> {
    const result = await this.api.getAddress();
    return result.address ?? null;
  }

  async checkConnection(): Promise<string | null> {
    try {
      const result = await this.api.isConnected();
      if (result.isConnected) {
        const addressResult = await this.api.getAddress();
        return addressResult.address ?? null;
      }
    } catch {
      /* silent — not connected */
    }
    return null;
  }

  async disconnect(): Promise<void> {
    // Freighter has no explicit disconnect API.
  }

  async signChallenge(challenge: string): Promise<string | null> {
    const result = await this.api.signMessage(challenge);
    if ('signedMessage' in result && result.signedMessage) {
      if (typeof result.signedMessage === 'string') {
        return result.signedMessage;
      }
      // Uint8Array → base64
      const binary = String.fromCharCode(...(result.signedMessage as Uint8Array));
      return window.btoa(binary);
    }
    return null;
  }

  async signTx(xdr: string, _network: string, networkPassphrase?: string): Promise<string | null> {
    // Re-throws on any error so callers can route through isUserDeclined().
    const result = await this.api.signTransaction(xdr, { networkPassphrase });
    return result.signedTxXdr ?? null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private buildAddressChangeObservable(): Observable<string> {
    if (typeof WatchWalletChanges === 'undefined') {
      return EMPTY;
    }
    return new Observable<string>((observer) => {
      const watcher = new WatchWalletChanges();
      watcher.watch(({ address }: { address?: string }) => {
        if (address) observer.next(address);
      });
      return () => watcher.stop();
    }).pipe(
      filter((addr): addr is string => typeof addr === 'string' && addr.length > 0),
      distinctUntilChanged(),
    );
  }

  private buildNetworkChangeObservable(): Observable<string> {
    if (typeof WatchWalletChanges === 'undefined') {
      return EMPTY;
    }
    return new Observable<string>((observer) => {
      const watcher = new WatchWalletChanges();
      watcher.watch(({ network }: { network?: string }) => {
        if (network) observer.next(network);
      });
      return () => watcher.stop();
    }).pipe(
      filter((net): net is string => typeof net === 'string' && net.length > 0),
      distinctUntilChanged(),
    );
  }
}
