import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import {
  WalletConnectComponent,
  WalletPickEvent,
} from '../../components/wallet-connect/wallet-connect';
import { NotificationCenterComponent } from '../../components/notification-center/notification-center';
import { AppState } from '../../../core/store/app.state';
import { LucideAngularModule, Droplets, Sun, Moon, Menu } from 'lucide-angular';
import { toggleSidebar, setDarkMode } from '../../../core/store/ui/ui.actions';
import { selectIsDarkMode } from '../../../core/store/ui/ui.selectors';
import {
  selectWalletAddress,
  selectSelectedWalletProvider,
} from '../../../core/store/wallet/wallet.selectors';
import * as AuthActions from '../../../core/store/auth/auth.actions';
import * as WalletActions from '../../../core/store/wallet/wallet.actions';
import { WalletService } from '../../../core/services/wallet.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [
    RouterLink,
    AsyncPipe,
    WalletConnectComponent,
    NotificationCenterComponent,
    LucideAngularModule,
  ],
  template: `
    <header
      class="h-16 bg-white dark:bg-dark-bg-lighter border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-6"
    >
      <div class="flex items-center gap-4">
        <button
          (click)="toggleSidebar()"
          class="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          aria-label="Toggle sidebar"
        >
          <lucide-angular
            [img]="MenuIcon"
            class="w-5 h-5 text-slate-600 dark:text-slate-400"
          ></lucide-angular>
        </button>
        <a routerLink="/dashboard" class="flex items-center gap-2">
          <div class="w-8 h-8 rounded-lg bg-stellar-blue flex items-center justify-center">
            <lucide-angular [img]="DropletsIcon" class="w-4 h-4 text-white"></lucide-angular>
          </div>
          <span class="font-bold text-lg text-slate-900 dark:text-white hidden sm:inline"
            >Water Credits</span
          >
        </a>
      </div>

      <div class="flex items-center gap-3">
        <button
          (click)="toggleDarkMode()"
          class="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
          [attr.aria-label]="isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
        >
          <lucide-angular
            [img]="isDarkMode ? SunIcon : MoonIcon"
            class="w-4 h-4 text-slate-500"
          ></lucide-angular>
        </button>
        <app-notification-center />
        <app-wallet-connect
          [connected]="!!(walletAddress$ | async)"
          [address]="(walletAddress$ | async) || ''"
          [selectedProvider]="(selectedProvider$ | async) || 'freighter'"
          (walletSelected)="onWalletSelected($event)"
          (connect)="connectWallet()"
          (disconnect)="disconnectWallet()"
        />
      </div>
    </header>
  `,
})
export class HeaderComponent implements OnInit, OnDestroy {
  private readonly store = inject(Store<AppState>);
  private readonly walletService = inject(WalletService);

  /** The connected wallet address from the store (wallet slice). */
  protected readonly walletAddress$ = this.store.select(selectWalletAddress);
  /** The currently-selected provider type (for the picker indicator). */
  protected readonly selectedProvider$ = this.store.select(selectSelectedWalletProvider);

  protected isDarkMode = true;
  protected readonly MenuIcon = Menu;
  protected readonly DropletsIcon = Droplets;
  protected readonly SunIcon = Sun;
  protected readonly MoonIcon = Moon;

  private readonly destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.store
      .select(selectIsDarkMode)
      .pipe(takeUntil(this.destroy$))
      .subscribe((dark) => {
        this.isDarkMode = dark;
        document.documentElement.classList.toggle('dark', dark);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  toggleSidebar(): void {
    this.store.dispatch(toggleSidebar());
  }

  /**
   * The user picked a wallet from the picker drop-down.
   * Tell the service which provider to use, then update the store slice.
   * `connect()` is emitted immediately after by the component, so
   * `connectWallet()` below will use the newly-selected provider.
   */
  onWalletSelected(event: WalletPickEvent): void {
    this.walletService.selectProvider(event.providerType);
    this.store.dispatch(WalletActions.selectWalletProvider({ providerType: event.providerType }));
  }

  async connectWallet(): Promise<void> {
    const address = await this.walletService.connect();
    if (address) {
      this.store.dispatch(WalletActions.connectWalletSuccess({ address }));
      this.store.dispatch(AuthActions.login());
    }
  }

  disconnectWallet(): void {
    this.store.dispatch(AuthActions.logout());
  }

  toggleDarkMode(): void {
    this.store.dispatch(setDarkMode({ isDark: !this.isDarkMode }));
  }
}
