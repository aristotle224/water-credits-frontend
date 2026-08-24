import { createReducer, on } from '@ngrx/store';
import { WalletProviderType } from '../../services/wallet/wallet.provider';
import * as WalletActions from './wallet.actions';

export interface WalletState {
  address: string | null;
  /** The wallet provider the user has selected. Defaults to 'freighter'. */
  selectedProvider: WalletProviderType;
  loading: boolean;
  error: string | null;
}

export const initialState: WalletState = {
  address: null,
  selectedProvider: 'freighter',
  loading: false,
  error: null,
};

export const walletReducer = createReducer(
  initialState,

  on(WalletActions.connectWallet, (state) => ({ ...state, loading: true, error: null })),

  on(WalletActions.connectWalletSuccess, (state, { address }) => ({
    ...state,
    address,
    loading: false,
  })),

  on(WalletActions.connectWalletFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(WalletActions.disconnectWallet, (state) => ({
    ...state,
    address: null,
  })),

  on(WalletActions.selectWalletProvider, (state, { providerType }) => ({
    ...state,
    selectedProvider: providerType,
    // Clear address when switching providers — the new provider may not be
    // connected yet and showing a stale address from the old provider would
    // be misleading.
    address: null,
    error: null,
  })),
);
