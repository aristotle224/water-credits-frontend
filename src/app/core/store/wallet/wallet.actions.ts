import { createAction, props } from '@ngrx/store';
import { WalletProviderType } from '../../services/wallet/wallet.provider';

// ── Connect ───────────────────────────────────────────────────────────────────

export const connectWallet = createAction('[Wallet] Connect');
export const connectWalletSuccess = createAction(
  '[Wallet] Connect Success',
  props<{ address: string }>(),
);
export const connectWalletFailure = createAction(
  '[Wallet] Connect Failure',
  props<{ error: string }>(),
);

// ── Disconnect ────────────────────────────────────────────────────────────────

export const disconnectWallet = createAction('[Wallet] Disconnect');

// ── Provider selection ────────────────────────────────────────────────────────

/**
 * Dispatched when the user picks a wallet in the wallet-picker UI.
 * The WalletService.selectProvider() call happens in the component before
 * dispatching this action so that the registry is updated synchronously;
 * this action simply keeps the NgRx slice in sync.
 */
export const selectWalletProvider = createAction(
  '[Wallet] Select Provider',
  props<{ providerType: WalletProviderType }>(),
);
