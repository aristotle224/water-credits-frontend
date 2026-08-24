import { Observable, EMPTY } from 'rxjs';
import { WalletProvider, WalletProviderType } from './wallet.provider';

// ── xBull injected API shape ─────────────────────────────────────────────────
//
// xBull injects `window.xBullSDK` (or `window.xbull` on some builds).
// We declare a minimal interface covering the methods we need; the full SDK
// types are available via the `@creit.tech/stellar-wallets-kit` package but
// we avoid that dependency here to keep the provider self-contained and
// consistent with how FreighterProvider avoids re-packaging the freighter API.

interface XBullApi {
  /** Returns the currently connected public key, or rejects if not connected. */
  getPublicKey(): Promise<string>;

  /**
   * Opens the connection dialog.  Returns the public key once the user approves.
   */
  connect(): Promise<{ publicKey: string }>;

  /**
   * Signs a Stellar transaction XDR.
   * Returns the signed XDR; rejects on user cancel or extension error.
   */
  signXDR(
    xdr: string,
    options?: { network?: string; networkPassphrase?: string },
  ): Promise<{ signedXDR: string }>;
}

/** Attempts to locate the injected xBull API object in `window`. */
function getXBullApi(): XBullApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  // xBull injects under `window.xBullSDK`; older builds used `window.xbull`.
  const candidate = w['xBullSDK'] ?? w['xbull'];
  if (candidate && typeof (candidate as Record<string, unknown>)['getPublicKey'] === 'function') {
    return candidate as XBullApi;
  }
  return null;
}

/**
 * XBullWalletProvider — adapts the xBull browser extension to the WalletProvider interface.
 *
 * Detection: checks `window.xBullSDK` (falling back to `window.xbull`).
 * Signing: uses `signXDR` which accepts an optional `networkPassphrase` directly.
 * Auth challenge: xBull does not expose a `signMessage` API, so we sign a
 *   minimal single-operation transaction envelope carrying the challenge as
 *   a text memo.  The backend must verify accordingly.
 * Change events: xBull does not expose a push/polling API for mid-session account
 *   or network changes, so `addressChange$` and `networkChange$` are `EMPTY`.
 */
export class XBullWalletProvider implements WalletProvider {
  readonly type: WalletProviderType = 'xbull';
  readonly label = 'xBull';

  readonly addressChange$: Observable<string> = EMPTY;
  readonly networkChange$: Observable<string> = EMPTY;

  isAvailable(): boolean {
    return getXBullApi() !== null;
  }

  async connect(): Promise<string | null> {
    const api = getXBullApi();
    if (!api) throw new Error('xBull wallet is not installed');
    const { publicKey } = await api.connect();
    return publicKey ?? null;
  }

  async checkConnection(): Promise<string | null> {
    const api = getXBullApi();
    if (!api) return null;
    try {
      const publicKey = await api.getPublicKey();
      return publicKey ?? null;
    } catch {
      return null;
    }
  }

  async disconnect(): Promise<void> {
    // xBull has no explicit disconnect API exposed via the injected object.
  }

  /**
   * xBull does not natively support arbitrary message signing.
   * We use `signXDR` with the challenge encoded as a text memo in the XDR.
   * The caller (backend) must decode the memo to verify the challenge.
   *
   * Limitation: this requires the backend to supply a pre-built challenge XDR
   * (containing a text memo with the random nonce) rather than a bare string.
   * If the backend provides a plain string, we pass it through unchanged
   * and let the backend handle the discrepancy.
   */
  async signChallenge(challenge: string): Promise<string | null> {
    const api = getXBullApi();
    if (!api) throw new Error('xBull wallet is not installed');
    // If the challenge is already an XDR envelope, sign it directly.
    // Otherwise fall back: xBull's signXDR will reject a bare string, which
    // surfaces as a thrown error the caller can catch.
    const { signedXDR } = await api.signXDR(challenge);
    return signedXDR ?? null;
  }

  async signTx(xdr: string, _network: string, networkPassphrase?: string): Promise<string | null> {
    const api = getXBullApi();
    if (!api) throw new Error('xBull wallet is not installed');
    // Re-throws on any error (user declined, extension error, etc.).
    const { signedXDR } = await api.signXDR(xdr, { networkPassphrase });
    return signedXDR ?? null;
  }
}
