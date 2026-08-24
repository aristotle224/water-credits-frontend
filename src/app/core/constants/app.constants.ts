export const STORAGE_KEYS = {
  AUTH_TOKEN: 'token',
  SENSOR_ALERT_THRESHOLDS: 'sensor-alert-thresholds',
  /** Persists the user's chosen wallet provider across page reloads. */
  WALLET_PROVIDER: 'wallet-provider',
} as const;

export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 10,
  MAX_SELECT_LIMIT: 100,
  SMALL_LIMIT: 5,
  MEDIUM_LIMIT: 50,
} as const;

export const REFRESH_INTERVALS = {
  SENSOR_AUTO_REFRESH_MS: 30000,
  TOOLTIP_COPY_DURATION_MS: 2000,
} as const;

export const CHART_DEFAULTS = {
  CHART_HEIGHT: 300,
  MAP_HEIGHT: 400,
  DEBOUNCE_MS: 300,
  SPARKLINE_POINTS: 20,
  CHART_POINTS: 60,
  MAX_ZOOM: 19,
} as const;

export const DATE_LOCALE = 'en-US' as const;

export const MAP_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
