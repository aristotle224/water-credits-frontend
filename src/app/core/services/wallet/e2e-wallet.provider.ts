import { EMPTY, Observable } from 'rxjs';
import { WalletProvider, WalletProviderType } from './wallet.provider';

/**
 * E2E-only wallet provider.
 *
 * Used exclusively by the end-to-end test suite (Playwright). It is installed
 * by `WalletProviderRegistry` only when `window.__WC_E2E_WALLET_ADDRESS__` is
 * present, which the Playwright fixtures set via `page.addInitScript` before
 * the Angular application boots.
 *
 * Because it returns deterministic values for `connect()`, `signChallenge()`
 * and `signTx()`, the e2e suite never touches a real Freighter extension or
 * the Stellar testnet — eliminating the flakiness that live wallet signing
 * would otherwise introduce. It is inert in production (the global is never
 * set there), so it is safe to bundle.
 */
export class E2EWalletProvider implements WalletProvider {
  readonly type: WalletProviderType = 'freighter';
  readonly label = 'E2E Mock Wallet';

  // No account/network switching is exercised by the e2e journeys, so we use
  // the always-empty observable to keep the change streams stable.
  readonly addressChange$: Observable<string> = EMPTY;
  readonly networkChange$: Observable<string> = EMPTY;

  constructor(private readonly address: string) {}

  isAvailable(): boolean {
    return true;
  }

  async connect(): Promise<string | null> {
    return this.address;
  }

  async checkConnection(): Promise<string | null> {
    return this.address;
  }

  async disconnect(): Promise<void> {
    /* no-op for the mock */
  }

  async signChallenge(_challenge: string): Promise<string | null> {
    return 'e2e-signature';
  }

  async signTx(xdr: string): Promise<string | null> {
    // Echo the XDR so the assertions in the e2e suite can verify the signing
    // step was actually exercised by the effects.
    return `e2e-signed:${xdr}`;
  }
}
