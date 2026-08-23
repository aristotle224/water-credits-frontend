import { Observable, EMPTY } from 'rxjs';
import { WalletProvider, WalletProviderType } from './wallet.provider';

// ── LOBSTR injected API shape ────────────────────────────────────────────────
//
// LOBSTR injects `window.lobstr` (or `window.stellar` on some builds).
// The object exposes a subset of the SEP-7 / SEP-43 browser wallet API.
// We declare a minimal interface here; the full SDK types are not published
// as an npm package for LOBSTR at the time of writing.

interface LobstrApi {
  /** Returns the connected public key, or rejects if not connected. */
  getPublicKey(): Promise<string>;

  /**
   * Requests wallet access and returns the public key.
   * Resolves immediately if the user has already granted access.
   */
  connect(): Promise<string>;

  /**
   * Signs an arbitrary message (used for the authentication challenge).
   * Returns a base64-encoded signature.
   */
  signMessage(message: string): Promise<{ signature: string }>;

  /**
   * Signs a Stellar transaction XDR.
   * Resolves with the signed XDR string; rejects on user cancel or error.
   */
  signTransaction(xdr: string, options?: { network?: string }): Promise<{ signedXdr: string }>;
}

/** Attempts to locate the injected LOBSTR API object in `window`. */
function getLobstrApi(): LobstrApi | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  // LOBSTR injects under `window.lobstr`; some older builds used `window.stellar`.
  const candidate = w['lobstr'] ?? w['stellar'];
  if (candidate && typeof (candidate as Record<string, unknown>)['getPublicKey'] === 'function') {
    return candidate as LobstrApi;
  }
  return null;
}

/**
 * LobstrWalletProvider — adapts the LOBSTR browser wallet to the WalletProvider interface.
 *
 * Detection: checks `window.lobstr` (falling back to `window.stellar`).
 * Signing: uses `signTransaction` which resolves/rejects without an explicit
 *   network passphrase parameter — LOBSTR reads the network from the XDR itself.
 * Change events: LOBSTR does not expose a polling/push API for account switches,
 *   so `addressChange$` and `networkChange$` are `EMPTY`.
 */
export class LobstrWalletProvider implements WalletProvider {
  readonly type: WalletProviderType = 'lobstr';
  readonly label = 'LOBSTR';

  readonly addressChange$: Observable<string> = EMPTY;
  readonly networkChange$: Observable<string> = EMPTY;

  isAvailable(): boolean {
    return getLobstrApi() !== null;
  }

  async connect(): Promise<string | null> {
    const api = getLobstrApi();
    if (!api) throw new Error('LOBSTR wallet is not installed');
    const publicKey = await api.connect();
    return publicKey ?? null;
  }

  async checkConnection(): Promise<string | null> {
    const api = getLobstrApi();
    if (!api) return null;
    try {
      const publicKey = await api.getPublicKey();
      return publicKey ?? null;
    } catch {
      return null;
    }
  }

  async disconnect(): Promise<void> {
    // LOBSTR has no explicit disconnect API exposed via the injected object.
  }

  async signChallenge(challenge: string): Promise<string | null> {
    const api = getLobstrApi();
    if (!api) throw new Error('LOBSTR wallet is not installed');
    const { signature } = await api.signMessage(challenge);
    return signature ?? null;
  }

  async signTx(xdr: string, network: string, _networkPassphrase?: string): Promise<string | null> {
    const api = getLobstrApi();
    if (!api) throw new Error('LOBSTR wallet is not installed');
    // Re-throws on any error (user declined, extension error, etc.) so the
    // caller can route through isUserDeclined() / extractSigningError().
    const { signedXdr } = await api.signTransaction(xdr, { network });
    return signedXdr ?? null;
  }
}
