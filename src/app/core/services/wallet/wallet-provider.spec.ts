/**
 * wallet-provider.spec.ts
 *
 * Covers:
 *  1. WalletProviderRegistry — getAll(), get(), getActive(), setActive(),
 *     getStoredType(), and persistence across instances.
 *  2. FreighterWalletProvider parity — every public method behaves identically
 *     to the original WalletService (the code it replaced).
 *  3. LobstrWalletProvider and XBullWalletProvider — availability detection,
 *     connect, checkConnection, signTx error propagation.
 *  4. Provider selection via WalletService — switching providers clears the
 *     address and persists the choice to localStorage.
 */

import { TestBed } from '@angular/core/testing';
import { WalletProviderRegistry } from '../../../core/services/wallet/wallet-provider.registry';
import { WalletProviderType } from '../../../core/services/wallet/wallet.provider';
import {
  FreighterWalletProvider,
  FreighterApi,
} from '../../../core/services/wallet/freighter.provider';
import { LobstrWalletProvider } from '../../../core/services/wallet/lobstr.provider';
import { XBullWalletProvider } from '../../../core/services/wallet/xbull.provider';
import { STORAGE_KEYS } from '../../../core/constants/app.constants';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function clearStorage(): void {
  localStorage.removeItem(STORAGE_KEYS.WALLET_PROVIDER);
}

/** Builds a minimal FreighterApi mock. */
function buildFreighterApiMock(): {
  isConnected: ReturnType<typeof vi.fn>;
  getAddress: ReturnType<typeof vi.fn>;
  signMessage: ReturnType<typeof vi.fn>;
  signTransaction: ReturnType<typeof vi.fn>;
} {
  return {
    isConnected: vi.fn(),
    getAddress: vi.fn(),
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
  };
}

// ─── WalletProviderRegistry ──────────────────────────────────────────────────

describe('WalletProviderRegistry', () => {
  let registry: WalletProviderRegistry;

  beforeEach(() => {
    clearStorage();
    TestBed.configureTestingModule({});
    registry = TestBed.inject(WalletProviderRegistry);
  });

  afterEach(() => {
    clearStorage();
  });

  describe('getAll()', () => {
    it('returns metadata for all three known providers', () => {
      const all = registry.getAll();
      const types = all.map((m) => m.type);
      expect(types).toContain('freighter');
      expect(types).toContain('lobstr');
      expect(types).toContain('xbull');
    });

    it('returns available providers before unavailable ones', () => {
      const all = registry.getAll();
      let seenUnavailable = false;
      for (const meta of all) {
        if (!meta.available) {
          seenUnavailable = true;
        } else {
          expect(seenUnavailable).toBe(false);
        }
      }
    });
  });

  describe('get()', () => {
    it('returns a FreighterWalletProvider instance', () => {
      expect(registry.get('freighter')).toBeInstanceOf(FreighterWalletProvider);
    });

    it('returns a LobstrWalletProvider instance', () => {
      expect(registry.get('lobstr')).toBeInstanceOf(LobstrWalletProvider);
    });

    it('returns an XBullWalletProvider instance', () => {
      expect(registry.get('xbull')).toBeInstanceOf(XBullWalletProvider);
    });

    it('throws for an unknown provider type', () => {
      expect(() => registry.get('unknown' as WalletProviderType)).toThrow();
    });
  });

  describe('getActive() — defaults', () => {
    it('defaults to freighter when nothing is stored in localStorage', () => {
      expect(registry.getActive().type).toBe('freighter');
    });
  });

  describe('setActive() + getStoredType()', () => {
    it('persists the chosen provider to localStorage', () => {
      registry.setActive('lobstr');
      expect(localStorage.getItem(STORAGE_KEYS.WALLET_PROVIDER)).toBe('lobstr');
    });

    it('getStoredType() returns the persisted type', () => {
      registry.setActive('xbull');
      expect(registry.getStoredType()).toBe('xbull');
    });

    it('getActive() returns the persisted provider after setActive()', () => {
      registry.setActive('lobstr');
      expect(registry.getActive().type).toBe('lobstr');
    });

    it('throws for an unknown type in setActive()', () => {
      expect(() => registry.setActive('unknown' as WalletProviderType)).toThrow();
    });
  });

  describe('persistence across registry instantiation', () => {
    it('a new registry instance reads the same persisted selection', () => {
      registry.setActive('xbull');
      const registry2 = new WalletProviderRegistry();
      expect(registry2.getActive().type).toBe('xbull');
    });
  });
});

// ─── FreighterWalletProvider parity ──────────────────────────────────────────

describe('FreighterWalletProvider', () => {
  let apiMock: ReturnType<typeof buildFreighterApiMock>;
  let provider: FreighterWalletProvider;

  beforeEach(() => {
    apiMock = buildFreighterApiMock();
    // Pass the mock via the constructor — no module-level mock needed.
    provider = new FreighterWalletProvider(apiMock as unknown as FreighterApi);
    // Set window.freighterApi so isAvailable() returns true.
    (window as unknown as Record<string, unknown>)['freighterApi'] = {};
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['freighterApi'];
  });

  describe('isAvailable()', () => {
    it('returns true when window.freighterApi is present', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('returns false when window.freighterApi is absent', () => {
      delete (window as unknown as Record<string, unknown>)['freighterApi'];
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('checkConnection()', () => {
    it('returns the address when Freighter is connected', async () => {
      apiMock.isConnected.mockResolvedValue({ isConnected: true });
      apiMock.getAddress.mockResolvedValue({ address: 'GABC123' });
      expect(await provider.checkConnection()).toBe('GABC123');
    });

    it('returns null when Freighter is not connected', async () => {
      apiMock.isConnected.mockResolvedValue({ isConnected: false });
      expect(await provider.checkConnection()).toBeNull();
    });

    it('returns null when isConnected throws', async () => {
      apiMock.isConnected.mockRejectedValue(new Error('extension error'));
      expect(await provider.checkConnection()).toBeNull();
    });
  });

  describe('connect()', () => {
    it('returns the address on success', async () => {
      apiMock.getAddress.mockResolvedValue({ address: 'GABC123' });
      expect(await provider.connect()).toBe('GABC123');
    });

    it('returns null when getAddress returns no address', async () => {
      apiMock.getAddress.mockResolvedValue({ address: undefined });
      expect(await provider.connect()).toBeNull();
    });
  });

  describe('disconnect()', () => {
    it('resolves without throwing (Freighter has no explicit disconnect)', async () => {
      await expect(provider.disconnect()).resolves.toBeUndefined();
    });
  });

  describe('signChallenge()', () => {
    it('returns the string signedMessage directly', async () => {
      apiMock.signMessage.mockResolvedValue({ signedMessage: 'sig-abc' });
      expect(await provider.signChallenge('challenge-nonce')).toBe('sig-abc');
    });

    it('converts a Uint8Array signedMessage to base64', async () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      apiMock.signMessage.mockResolvedValue({ signedMessage: bytes });
      const result = await provider.signChallenge('challenge-nonce');
      expect(result).toBe(window.btoa('Hello'));
    });

    it('returns null when signedMessage is absent', async () => {
      apiMock.signMessage.mockResolvedValue({});
      expect(await provider.signChallenge('challenge-nonce')).toBeNull();
    });
  });

  describe('signTx()', () => {
    it('returns the signed XDR on success', async () => {
      apiMock.signTransaction.mockResolvedValue({ signedTxXdr: 'signed-xdr' });
      expect(await provider.signTx('raw-xdr', 'STELLAR')).toBe('signed-xdr');
    });

    it('returns null when signedTxXdr is absent (edge case)', async () => {
      apiMock.signTransaction.mockResolvedValue({});
      expect(await provider.signTx('raw-xdr', 'STELLAR')).toBeNull();
    });

    it('re-throws when the user declines', async () => {
      apiMock.signTransaction.mockRejectedValue(new Error('User declined'));
      await expect(provider.signTx('raw-xdr', 'STELLAR')).rejects.toThrow('User declined');
    });

    it('re-throws on generic signing errors', async () => {
      apiMock.signTransaction.mockRejectedValue(new Error('extension crash'));
      await expect(provider.signTx('raw-xdr', 'STELLAR')).rejects.toThrow('extension crash');
    });
  });
});

// ─── LobstrWalletProvider ────────────────────────────────────────────────────

describe('LobstrWalletProvider', () => {
  let provider: LobstrWalletProvider;

  const mockLobstr = {
    getPublicKey: vi.fn(),
    connect: vi.fn(),
    signMessage: vi.fn(),
    signTransaction: vi.fn(),
  };

  beforeEach(() => {
    provider = new LobstrWalletProvider();
    (window as unknown as Record<string, unknown>)['lobstr'] = mockLobstr;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['lobstr'];
  });

  describe('isAvailable()', () => {
    it('returns true when window.lobstr is present', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('returns false when window.lobstr is absent', () => {
      delete (window as unknown as Record<string, unknown>)['lobstr'];
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('checkConnection()', () => {
    it('returns the public key when LOBSTR is connected', async () => {
      mockLobstr.getPublicKey.mockResolvedValue('GDEF456');
      expect(await provider.checkConnection()).toBe('GDEF456');
    });

    it('returns null when getPublicKey throws', async () => {
      mockLobstr.getPublicKey.mockRejectedValue(new Error('not connected'));
      expect(await provider.checkConnection()).toBeNull();
    });
  });

  describe('connect()', () => {
    it('returns the public key on success', async () => {
      mockLobstr.connect.mockResolvedValue('GDEF456');
      expect(await provider.connect()).toBe('GDEF456');
    });

    it('throws when window.lobstr is not present', async () => {
      delete (window as unknown as Record<string, unknown>)['lobstr'];
      await expect(provider.connect()).rejects.toThrow('LOBSTR wallet is not installed');
    });
  });

  describe('signTx()', () => {
    it('returns the signed XDR on success', async () => {
      mockLobstr.signTransaction.mockResolvedValue({ signedXdr: 'signed-lobstr-xdr' });
      expect(await provider.signTx('raw-xdr', 'STELLAR')).toBe('signed-lobstr-xdr');
    });

    it('re-throws on user decline', async () => {
      mockLobstr.signTransaction.mockRejectedValue(new Error('User rejected the request'));
      await expect(provider.signTx('raw-xdr', 'STELLAR')).rejects.toThrow('User rejected');
    });
  });

  describe('addressChange$ / networkChange$', () => {
    it('are EMPTY (LOBSTR does not expose a push API)', async () => {
      const emissions: string[] = [];
      provider.addressChange$.subscribe((v) => emissions.push(v));
      await new Promise((r) => setTimeout(r, 20));
      expect(emissions).toHaveLength(0);
    });
  });
});

// ─── XBullWalletProvider ─────────────────────────────────────────────────────

describe('XBullWalletProvider', () => {
  let provider: XBullWalletProvider;

  const mockXBull = {
    getPublicKey: vi.fn(),
    connect: vi.fn(),
    signXDR: vi.fn(),
  };

  beforeEach(() => {
    provider = new XBullWalletProvider();
    (window as unknown as Record<string, unknown>)['xBullSDK'] = mockXBull;
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>)['xBullSDK'];
  });

  describe('isAvailable()', () => {
    it('returns true when window.xBullSDK is present', () => {
      expect(provider.isAvailable()).toBe(true);
    });

    it('returns false when window.xBullSDK is absent', () => {
      delete (window as unknown as Record<string, unknown>)['xBullSDK'];
      expect(provider.isAvailable()).toBe(false);
    });
  });

  describe('checkConnection()', () => {
    it('returns the public key when xBull is connected', async () => {
      mockXBull.getPublicKey.mockResolvedValue('GHIJ789');
      expect(await provider.checkConnection()).toBe('GHIJ789');
    });

    it('returns null when getPublicKey throws', async () => {
      mockXBull.getPublicKey.mockRejectedValue(new Error('locked'));
      expect(await provider.checkConnection()).toBeNull();
    });
  });

  describe('connect()', () => {
    it('returns the public key on success', async () => {
      mockXBull.connect.mockResolvedValue({ publicKey: 'GHIJ789' });
      expect(await provider.connect()).toBe('GHIJ789');
    });

    it('throws when window.xBullSDK is not present', async () => {
      delete (window as unknown as Record<string, unknown>)['xBullSDK'];
      await expect(provider.connect()).rejects.toThrow('xBull wallet is not installed');
    });
  });

  describe('signTx()', () => {
    it('returns the signed XDR on success', async () => {
      mockXBull.signXDR.mockResolvedValue({ signedXDR: 'signed-xbull-xdr' });
      expect(await provider.signTx('raw-xdr', 'STELLAR')).toBe('signed-xbull-xdr');
    });

    it('re-throws on user decline', async () => {
      mockXBull.signXDR.mockRejectedValue(new Error('cancelled'));
      await expect(provider.signTx('raw-xdr', 'STELLAR')).rejects.toThrow('cancelled');
    });
  });
});

// ─── Provider selection via WalletService ─────────────────────────────────────

describe('WalletService — provider selection', () => {
  beforeEach(() => {
    clearStorage();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    clearStorage();
  });

  it('starts with freighter as default when nothing is persisted', async () => {
    const { WalletService } = await import('../../../core/services/wallet.service');
    const svc = TestBed.inject(WalletService);
    expect(svc.getActiveProviderType()).toBe('freighter');
  });

  it('selectProvider() changes the active provider and clears the stored key', async () => {
    const { WalletService } = await import('../../../core/services/wallet.service');
    const svc = TestBed.inject(WalletService);
    (svc as unknown as { publicKeySubject: { next: (v: string) => void } }).publicKeySubject.next(
      'GABC123',
    );

    svc.selectProvider('lobstr');

    expect(svc.getActiveProviderType()).toBe('lobstr');
    expect(svc.getStoredPublicKey()).toBeNull();
  });

  it('selectProvider() persists the choice to localStorage', async () => {
    const { WalletService } = await import('../../../core/services/wallet.service');
    const svc = TestBed.inject(WalletService);
    svc.selectProvider('xbull');
    expect(localStorage.getItem(STORAGE_KEYS.WALLET_PROVIDER)).toBe('xbull');
  });
});
