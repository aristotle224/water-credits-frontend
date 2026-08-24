import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NgIf, NgFor } from '@angular/common';
import { StellarAddressPipe } from '../../pipes/stellar-address.pipe';
import { ClickOutsideDirective } from '../../directives/click-outside.directive';
import { LucideAngularModule, Wallet, ChevronDown, LogOut, Copy, Check } from 'lucide-angular';
import {
  WalletProviderRegistry,
  WalletProviderMeta,
} from '../../../core/services/wallet/wallet-provider.registry';
import { WalletProviderType } from '../../../core/services/wallet/wallet.provider';

/** Emitted when the user picks a wallet from the picker UI. */
export interface WalletPickEvent {
  providerType: WalletProviderType;
}

/**
 * WalletConnectComponent — header wallet button with an integrated wallet picker.
 *
 * States:
 *   1. Not connected, picker closed → single "Connect Wallet" button.
 *   2. Not connected, picker open → drop-down list of available wallets.
 *   3. Connected → address chip with copy/disconnect menu (unchanged from before).
 *
 * The parent (typically the store-connected header) is responsible for:
 *   - Calling `WalletService.selectProvider(type)` on `(walletSelected)`.
 *   - Dispatching `connectWallet` (or equivalent) to trigger the connect flow.
 *   - Setting `[connected]` and `[address]` from the store.
 */
@Component({
  selector: 'app-wallet-connect',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgIf, NgFor, StellarAddressPipe, LucideAngularModule, ClickOutsideDirective],
  template: `
    <div appClickOutside (appClickOutside)="closeAll()" class="relative">
      <!-- ── Connected state ──────────────────────────────────────────── -->
      <ng-container *ngIf="connected">
        <button
          (click)="toggleMenu()"
          class="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          aria-haspopup="true"
          [attr.aria-expanded]="showMenu"
          aria-label="Wallet menu"
        >
          <span class="w-2 h-2 rounded-full bg-green-500" aria-hidden="true"></span>
          <span class="text-sm font-mono">{{ address | stellarAddress }}</span>
          <lucide-angular
            [img]="ChevronDownIcon"
            class="w-3 h-3 text-slate-400"
            aria-hidden="true"
          ></lucide-angular>
        </button>

        <div
          *ngIf="showMenu"
          role="menu"
          aria-label="Wallet options"
          class="absolute right-0 mt-2 w-56 bg-white dark:bg-dark-bg-lighter rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50"
        >
          <div class="px-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <p class="text-xs text-slate-500 dark:text-slate-400">Connected as</p>
            <p class="text-sm font-mono truncate">{{ address }}</p>
          </div>
          <button
            (click)="copyAddress()"
            role="menuitem"
            class="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <lucide-angular
              [img]="copied ? CheckIcon : CopyIcon"
              class="w-4 h-4"
              aria-hidden="true"
            ></lucide-angular>
            {{ copied ? 'Copied!' : 'Copy Address' }}
          </button>
          <button
            (click)="onDisconnect()"
            role="menuitem"
            class="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <lucide-angular [img]="LogOutIcon" class="w-4 h-4" aria-hidden="true"></lucide-angular>
            Disconnect
          </button>
        </div>
      </ng-container>

      <!-- ── Disconnected state ───────────────────────────────────────── -->
      <ng-container *ngIf="!connected">
        <!-- Primary connect button — opens the picker -->
        <button
          (click)="togglePicker()"
          class="btn btn-primary text-sm flex items-center gap-2"
          aria-haspopup="listbox"
          [attr.aria-expanded]="showPicker"
        >
          <lucide-angular [img]="WalletIcon" class="w-4 h-4" aria-hidden="true"></lucide-angular>
          Connect Wallet
          <lucide-angular
            [img]="ChevronDownIcon"
            class="w-3 h-3"
            aria-hidden="true"
          ></lucide-angular>
        </button>

        <!-- Wallet picker dropdown -->
        <div
          *ngIf="showPicker"
          role="listbox"
          aria-label="Select a wallet"
          class="absolute right-0 mt-2 w-64 bg-white dark:bg-dark-bg-lighter rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 py-2 z-50"
        >
          <p class="px-4 py-1 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            Choose a wallet
          </p>

          <button
            *ngFor="let meta of walletOptions"
            role="option"
            [attr.aria-selected]="meta.type === selectedProvider"
            (click)="onSelectWallet(meta)"
            class="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors"
            [class.opacity-40]="!meta.available"
            [class.cursor-not-allowed]="!meta.available"
            [class.hover:bg-slate-50]="meta.available"
            [class.dark:hover:bg-slate-700]="meta.available"
            [class.text-slate-700]="meta.available"
            [class.dark:text-slate-300]="meta.available"
            [class.text-slate-400]="!meta.available"
            [disabled]="!meta.available"
            [attr.aria-disabled]="!meta.available"
          >
            <span class="flex items-center gap-2">
              <lucide-angular
                [img]="WalletIcon"
                class="w-4 h-4"
                aria-hidden="true"
              ></lucide-angular>
              {{ meta.label }}
            </span>
            <span *ngIf="!meta.available" class="text-xs text-slate-400 dark:text-slate-500"
              >Not installed</span
            >
            <span
              *ngIf="meta.type === selectedProvider && meta.available"
              class="w-2 h-2 rounded-full bg-blue-500"
              aria-label="Selected"
            ></span>
          </button>
        </div>
      </ng-container>
    </div>
  `,
})
export class WalletConnectComponent implements OnInit {
  @Input() connected = false;
  @Input() address = '';
  @Input() network = 'testnet';
  @Input() selectedProvider: WalletProviderType = 'freighter';

  /** Emitted when the user selects a wallet provider from the picker. */
  @Output() walletSelected = new EventEmitter<WalletPickEvent>();

  /** Emitted when the user confirms they want to connect (after picking). */
  @Output() connect = new EventEmitter<void>();

  /** Emitted when the user clicks "Disconnect" from the connected menu. */
  @Output() disconnect = new EventEmitter<void>();

  protected showMenu = false;
  protected showPicker = false;
  protected copied = false;
  protected walletOptions: WalletProviderMeta[] = [];

  protected readonly WalletIcon = Wallet;
  protected readonly ChevronDownIcon = ChevronDown;
  protected readonly LogOutIcon = LogOut;
  protected readonly CopyIcon = Copy;
  protected readonly CheckIcon = Check;

  constructor(private readonly registry: WalletProviderRegistry) {}

  ngOnInit(): void {
    this.walletOptions = this.registry.getAll();
  }

  protected toggleMenu(): void {
    this.showMenu = !this.showMenu;
    this.showPicker = false;
  }

  protected togglePicker(): void {
    this.showPicker = !this.showPicker;
    this.showMenu = false;
  }

  protected closeAll(): void {
    this.showMenu = false;
    this.showPicker = false;
  }

  protected copyAddress(): void {
    void navigator.clipboard.writeText(this.address);
    this.copied = true;
    setTimeout(() => (this.copied = false), 2000);
  }

  protected onDisconnect(): void {
    this.showMenu = false;
    this.disconnect.emit();
  }

  /**
   * User has selected a wallet from the picker.
   * Emits `walletSelected` so the parent can call
   * `WalletService.selectProvider()` and then dispatch `connectWallet`.
   * We also immediately emit `connect` so the parent can kick off the flow
   * in a single handler without needing two separate subscriptions.
   */
  protected onSelectWallet(meta: WalletProviderMeta): void {
    if (!meta.available) return;
    this.showPicker = false;
    this.walletSelected.emit({ providerType: meta.type });
    this.connect.emit();
  }
}
