import { Injectable } from '@angular/core';
import { WalletProvider, WalletProviderType } from './wallet.provider';
import { FreighterWalletProvider } from './freighter.provider';
import { LobstrWalletProvider } from './lobstr.provider';
import { XBullWalletProvider } from './xbull.provider';
import { E2EWalletProvider } from './e2e-wallet.provider';
import { STORAGE_KEYS } from '../../../core/constants/app.constants';

/**
 * Global flag set by the Playwright e2e fixtures (via `page.addInitScript`)
 * before the application boots. When present, the `freighter` slot is replaced
 * by {@link E2EWalletProvider} so the suite never depends on a real wallet
 * extension or the Stellar testnet. It is never set in production.
 */
const E2E_WALLET_ADDRESS_KEY = '__WC_E2E_WALLET_ADDRESS__';

function readE2EWalletAddress(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const value = (window as unknown as Record<string, string | undefined>)[
    E2E_WALLET_ADDRESS_KEY
  ];
  return value && value.length > 0 ? value : undefined;
}

/** Metadata used to populate the wallet-picker UI. */
export interface WalletProviderMeta {
  type: WalletProviderType;
  label: string;
  /** Whether the extension / app is currently detectable in the browser. */
  available: boolean;
}

/**
 * WalletProviderRegistry — creates and manages wallet provider instances.
 *
 * Responsibilities:
 *  - Owns a singleton instance of each known provider.
 *  - Exposes a list of all providers for the wallet-picker UI (including
 *    whether each one is currently installed in the browser).
 *  - Persists the user's wallet choice to `localStorage` (key:
 *    `STORAGE_KEYS.WALLET_PROVIDER`) so the selection survives page reloads.
 *  - Returns the active provider, defaulting to Freighter when nothing is
 *    stored (backward-compatible with existing sessions).
 *
 * The registry itself is `@Injectable({ providedIn: 'root' })` so it is a
 * singleton across the application and can be injected wherever needed.
 * Provider *instances* are plain class instances — they do not need Angular DI.
 */
  @Injectable({ providedIn: 'root' })
  export class WalletProviderRegistry {
    private readonly providers: Map<WalletProviderType, WalletProvider>;

    constructor() {
      const e2eAddress = readE2EWalletAddress();
      const freighter = e2eAddress
        ? new E2EWalletProvider(e2eAddress)
        : new FreighterWalletProvider();

      this.providers = new Map<WalletProviderType, WalletProvider>([
        ['freighter', freighter],
        ['lobstr', new LobstrWalletProvider()],
        ['xbull', new XBullWalletProvider()],
      ]);
    }

  /**
   * Returns metadata for all registered providers, sorted: available ones
   * first so the picker list is most useful without extra sorting in the UI.
   */
  getAll(): WalletProviderMeta[] {
    return Array.from(this.providers.values())
      .map((p) => ({ type: p.type, label: p.label, available: p.isAvailable() }))
      .sort((a, b) => Number(b.available) - Number(a.available));
  }

  /**
   * Returns the `WalletProvider` instance for the given type.
   * Throws if the type is not registered (programming error guard).
   */
  get(type: WalletProviderType): WalletProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`Unknown wallet provider: "${type}"`);
    }
    return provider;
  }

  /**
   * Returns the currently selected provider.
   *
   * Priority:
   *   1. Value stored in `localStorage` (survives reload).
   *   2. 'freighter' as the default (backward compatible).
   */
  getActive(): WalletProvider {
    const stored = this.readStoredType();
    return this.providers.get(stored ?? 'freighter') ?? this.providers.get('freighter')!;
  }

  /**
   * Persists the user's wallet choice to `localStorage`.
   * Called by `WalletService.selectProvider()`.
   */
  setActive(type: WalletProviderType): void {
    if (!this.providers.has(type)) {
      throw new Error(`Unknown wallet provider: "${type}"`);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET_PROVIDER, type);
    } catch {
      // localStorage may be unavailable in certain environments; ignore.
    }
  }

  /**
   * Returns the stored provider type, or `null` if nothing has been persisted.
   */
  getStoredType(): WalletProviderType | null {
    return this.readStoredType();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private readStoredType(): WalletProviderType | null {
    try {
      const value = localStorage.getItem(STORAGE_KEYS.WALLET_PROVIDER);
      if (value && this.providers.has(value as WalletProviderType)) {
        return value as WalletProviderType;
      }
    } catch {
      /* localStorage unavailable */
    }
    return null;
  }
}
