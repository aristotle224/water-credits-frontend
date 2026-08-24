import { createFeatureSelector, createSelector } from '@ngrx/store';
import { WalletState } from './wallet.reducer';

export const selectWalletState = createFeatureSelector<WalletState>('wallet');

export const selectWalletAddress = createSelector(selectWalletState, (state) => state.address);
export const selectWalletLoading = createSelector(selectWalletState, (state) => state.loading);
export const selectWalletError = createSelector(selectWalletState, (state) => state.error);
export const selectIsWalletConnected = createSelector(
  selectWalletState,
  (state) => !!state.address,
);
export const selectSelectedWalletProvider = createSelector(
  selectWalletState,
  (state) => state.selectedProvider,
);
