import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WalletConnectComponent, WalletPickEvent } from './wallet-connect';
import {
  WalletProviderRegistry,
  WalletProviderMeta,
} from '../../../core/services/wallet/wallet-provider.registry';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setClipboard(): void {
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: vi.fn() },
    configurable: true,
  });
}

/** Returns a registry mock with all three providers; only freighter is available. */
function buildRegistryMock(extraOptions: WalletProviderMeta[] = []): WalletProviderRegistry {
  const defaults: WalletProviderMeta[] = [
    { type: 'freighter', label: 'Freighter', available: true },
    { type: 'lobstr', label: 'LOBSTR', available: false },
    { type: 'xbull', label: 'xBull', available: false },
    ...extraOptions,
  ];
  return {
    getAll: vi.fn().mockReturnValue(defaults),
    get: vi.fn(),
    getActive: vi.fn(),
    setActive: vi.fn(),
    getStoredType: vi.fn().mockReturnValue(null),
  } as unknown as WalletProviderRegistry;
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletConnectComponent — connected state (unchanged behaviour)', () => {
  let component: WalletConnectComponent;
  let fixture: ComponentFixture<WalletConnectComponent>;

  beforeEach(async () => {
    setClipboard();
    await TestBed.configureTestingModule({
      imports: [WalletConnectComponent],
      providers: [{ provide: WalletProviderRegistry, useValue: buildRegistryMock() }],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletConnectComponent);
    component = fixture.componentInstance;
    component.connected = true;
    component.address = 'GCKFBEIYTKP2M6P4E4XJ3K5E6Q7V8N9XQ6Y87D7';
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  const getToggleButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  const getMenuButton = (label: string): HTMLButtonElement =>
    Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes(label)) as HTMLButtonElement;

  it('opens the dropdown when the wallet button is clicked', () => {
    getToggleButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Copy Address');
    expect(fixture.nativeElement.textContent).toContain('Disconnect');
  });

  it('closes the dropdown when the user clicks outside the component', () => {
    getToggleButton().click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Copy Address');
  });

  it('closes the dropdown when the wallet button is clicked again while open', () => {
    const btn = getToggleButton();
    btn.click();
    fixture.detectChanges();
    btn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Copy Address');
  });

  it('copies the connected wallet address', () => {
    const spy = vi.spyOn(navigator.clipboard, 'writeText');
    getToggleButton().click();
    fixture.detectChanges();
    getMenuButton('Copy Address').click();
    expect(spy).toHaveBeenCalledWith(component.address);
  });

  it('emits disconnect when the disconnect action is clicked', () => {
    const disconnectSpy = vi.fn();
    component.disconnect.subscribe(disconnectSpy);
    getToggleButton().click();
    fixture.detectChanges();
    getMenuButton('Disconnect').click();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });
});

// ─── Disconnected / wallet picker ─────────────────────────────────────────────

describe('WalletConnectComponent — disconnected state / wallet picker', () => {
  let component: WalletConnectComponent;
  let fixture: ComponentFixture<WalletConnectComponent>;
  let registryMock: WalletProviderRegistry;

  beforeEach(async () => {
    setClipboard();
    registryMock = buildRegistryMock();

    await TestBed.configureTestingModule({
      imports: [WalletConnectComponent],
      providers: [{ provide: WalletProviderRegistry, useValue: registryMock }],
    }).compileComponents();

    fixture = TestBed.createComponent(WalletConnectComponent);
    component = fixture.componentInstance;
    component.connected = false;
    component.selectedProvider = 'freighter';
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  const getConnectButton = (): HTMLButtonElement =>
    fixture.nativeElement.querySelector('button') as HTMLButtonElement;

  it('shows the "Connect Wallet" button when not connected', () => {
    expect(fixture.nativeElement.textContent).toContain('Connect Wallet');
  });

  it('does NOT show the connected address chip when not connected', () => {
    expect(fixture.nativeElement.querySelector('.font-mono')).toBeFalsy();
  });

  it('opens the wallet picker when the connect button is clicked', () => {
    getConnectButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Choose a wallet');
    expect(fixture.nativeElement.textContent).toContain('Freighter');
    expect(fixture.nativeElement.textContent).toContain('LOBSTR');
    expect(fixture.nativeElement.textContent).toContain('xBull');
  });

  it('closes the picker when clicking outside the component', () => {
    getConnectButton().click();
    fixture.detectChanges();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Choose a wallet');
  });

  it('closes the picker when the connect button is clicked again', () => {
    const btn = getConnectButton();
    btn.click();
    fixture.detectChanges();
    btn.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Choose a wallet');
  });

  it('marks unavailable wallets as disabled', () => {
    getConnectButton().click();
    fixture.detectChanges();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('[role=option]') as NodeListOf<HTMLButtonElement>,
    );
    const lobstrBtn = buttons.find((b) => b.textContent?.includes('LOBSTR'));
    expect(lobstrBtn?.disabled).toBe(true);
    expect(lobstrBtn?.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows "Not installed" label for unavailable wallets', () => {
    getConnectButton().click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Not installed');
  });

  it('emits walletSelected with the chosen providerType when an available wallet is clicked', () => {
    const pickedEvents: WalletPickEvent[] = [];
    component.walletSelected.subscribe((e) => pickedEvents.push(e));

    getConnectButton().click();
    fixture.detectChanges();

    const freighterBtn = Array.from(
      fixture.nativeElement.querySelectorAll('[role=option]') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Freighter'));

    freighterBtn!.click();
    fixture.detectChanges();

    expect(pickedEvents).toHaveLength(1);
    expect(pickedEvents[0].providerType).toBe('freighter');
  });

  it('emits connect after walletSelected when an available wallet is clicked', () => {
    const connectSpy = vi.fn();
    component.connect.subscribe(connectSpy);

    getConnectButton().click();
    fixture.detectChanges();

    const freighterBtn = Array.from(
      fixture.nativeElement.querySelectorAll('[role=option]') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Freighter'));

    freighterBtn!.click();
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  it('does NOT emit connect or walletSelected for unavailable (disabled) wallets', () => {
    const connectSpy = vi.fn();
    const selectedSpy = vi.fn();
    component.connect.subscribe(connectSpy);
    component.walletSelected.subscribe(selectedSpy);

    getConnectButton().click();
    fixture.detectChanges();

    // Directly call the protected method with an unavailable provider
    // (clicking a disabled button won't trigger the handler in jsdom)
    (
      component as unknown as {
        onSelectWallet: (m: { type: string; label: string; available: boolean }) => void;
      }
    ).onSelectWallet({ type: 'lobstr', label: 'LOBSTR', available: false });

    expect(connectSpy).not.toHaveBeenCalled();
    expect(selectedSpy).not.toHaveBeenCalled();
  });

  it('closes the picker after a wallet is selected', () => {
    getConnectButton().click();
    fixture.detectChanges();

    // Click the available Freighter button (which calls onSelectWallet internally)
    const freighterBtn = Array.from(
      fixture.nativeElement.querySelectorAll('[role=option]') as NodeListOf<HTMLButtonElement>,
    ).find((b) => b.textContent?.includes('Freighter'));
    freighterBtn!.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Choose a wallet');
  });
});
