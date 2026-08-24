/**
 * WalletProvider — the common interface every wallet adapter must implement.
 *
 * All methods return Promises so the calling code can be uniformly async.
 * `addressChange$` and `networkChange$` are Observables that emit when the
 * user changes their active account or network inside the wallet extension
 * mid-session.  Providers that cannot detect such changes should return
 * `EMPTY`.
 *
 * `signTx` **re-throws** on failure (including user-declined rejections) so
 * that callers can use `isUserDeclined()` / `extractSigningError()` from
 * `wallet-tx.utils.ts` to handle the different failure modes.
 */

import { Observable } from 'rxjs';

/** Stable string keys used in localStorage and NgRx state. */
export type WalletProviderType = 'freighter' | 'lobstr' | 'xbull';

export interface WalletProvider {
  /** Unique identifier. */
  readonly type: WalletProviderType;

  /** Human-readable label for the wallet-picker UI. */
  readonly label: string;

  /**
   * Returns `true` when the wallet extension / app is detectable in the
   * current browser environment.  Should be synchronous; must not throw.
   */
  isAvailable(): boolean;

  /**
   * Attempts to connect to the wallet and retrieve the user's public key.
   * Returns the public key string on success; returns `null` when the wallet
   * reports no connected account without throwing (e.g. not yet approved).
   * Throws on hard errors (extension not installed, permission denied, etc.).
   */
  connect(): Promise<string | null>;

  /**
   * Checks whether the wallet is already connected from a previous session
   * and retrieves the stored public key.  Used on app start / rehydration.
   * Returns the public key string if connected, `null` otherwise.
   */
  checkConnection(): Promise<string | null>;

  /**
   * Disconnects from the wallet.  Should clear any cached state held by the
   * provider.  Should NOT throw.
   */
  disconnect(): Promise<void>;

  /**
   * Signs a challenge string (used in the wallet-based authentication flow).
   * Returns the base64-encoded signature string.
   * Throws on failure; re-throws the wallet's own rejection so callers can
   * use `isUserDeclined()`.
   */
  signChallenge(challenge: string): Promise<string | null>;

  /**
   * Signs a Stellar transaction XDR.
   * Returns the signed XDR string on success; returns `null` only in the
   * degenerate case where the wallet returns no XDR without throwing.
   * **Re-throws** all real errors (including user-declined) so callers can
   * use `isUserDeclined()` / `extractSigningError()`.
   */
  signTx(xdr: string, network: string, networkPassphrase?: string): Promise<string | null>;

  /**
   * Observable that emits the new public key when the user switches their
   * active Stellar account mid-session.  Use `EMPTY` when unsupported.
   */
  readonly addressChange$: Observable<string>;

  /**
   * Observable that emits the new network name when the user switches networks
   * mid-session.  Use `EMPTY` when unsupported.
   */
  readonly networkChange$: Observable<string>;
}
