import { Component, OnInit, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { NgIf, NgFor, DecimalPipe } from '@angular/common';
import { Subject, BehaviorSubject, interval, EMPTY } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';
import { SensorDevice, SensorReading } from '../../../core/models/sensor-reading.model';
import { WebsocketService } from '../../../core/services/websocket.service';
import { NotificationService } from '../../../core/services/notification.service';
import {
  DataTableComponent,
  ColumnDef,
} from '../../../shared/components/data-table/data-table.component';
import { SkeletonLoaderComponent } from '../../../shared/components/skeleton-loader/skeleton-loader';
import {
  SensorChartComponent,
  ChartSeries,
} from '../../../shared/components/sensor-chart/sensor-chart';
import { DateFormatPipe } from '../../../shared/pipes/date-format.pipe';
import * as SensorsActions from '../../../core/store/sensors/sensors.actions';
import {
  selectSensorDevices,
  selectRecentReadings,
  selectSensorsLoading,
} from '../../../core/store/sensors/sensors.selectors';
import { AppState } from '../../../core/store/app.state';
import {
  LucideAngularModule,
  Activity,
  Droplets,
  Thermometer,
  Gauge,
  Wind,
  Atom,
  Beaker,
  FlaskConical,
  RefreshCw,
  Settings,
  Radio,
} from 'lucide-angular';
import { ParameterConfig } from '../../../core/models/shared-interfaces.model';

const PARAMETER_CONFIGS: ParameterConfig[] = [
  { key: 'ph', label: 'pH', unit: '', icon: Beaker, color: '#7B2FBE', decimals: 2 },
  {
    key: 'turbidity',
    label: 'Turbidity',
    unit: 'NTU',
    icon: Droplets,
    color: '#F59E0B',
    decimals: 1,
  },
  {
    key: 'dissolvedOxygen',
    label: 'Dissolved O₂',
    unit: 'mg/L',
    icon: Wind,
    color: '#3B82F6',
    decimals: 1,
  },
  { key: 'flowRate', label: 'Flow Rate', unit: 'm³/s', icon: Gauge, color: '#10B981', decimals: 3 },
  { key: 'nitrogen', label: 'Nitrogen', unit: 'mg/L', icon: Atom, color: '#EF4444', decimals: 2 },
  {
    key: 'phosphorus',
    label: 'Phosphorus',
    unit: 'mg/L',
    icon: FlaskConical,
    color: '#EC4899',
    decimals: 3,
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    icon: Thermometer,
    color: '#F97316',
    decimals: 1,
  },
];

const STATUS_THRESHOLDS: Record<string, { good: [number, number]; warning: [number, number] }> = {
  ph: { good: [6.5, 8.5], warning: [6.0, 9.0] },
  turbidity: { good: [0, 5], warning: [0, 15] },
  dissolvedOxygen: { good: [6, 20], warning: [4, 20] },
  flowRate: { good: [0.1, 100], warning: [0.05, 100] },
  nitrogen: { good: [0, 2], warning: [0, 5] },
  phosphorus: { good: [0, 0.5], warning: [0, 1.0] },
  temperature: { good: [15, 25], warning: [10, 30] },
};

@Component({
  selector: 'app-sensors-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NgIf,
    NgFor,
    DecimalPipe,
    RouterLink,
    DataTableComponent,
    SkeletonLoaderComponent,
    SensorChartComponent,
    DateFormatPipe,
    LucideAngularModule,
  ],
  template: `
    <div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-900 dark:text-white">Sensor Dashboard</h1>
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Real-time water quality monitoring
          </p>
        </div>
        <div class="flex items-center gap-3">
          <div
            class="flex items-center gap-2 bg-white dark:bg-dark-bg-lighter rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5"
          >
            <span
              class="w-2 h-2 rounded-full"
              [class]="wsConnected ? 'bg-green-500' : 'bg-red-500'"
            ></span>
            <span class="text-xs text-slate-500">{{
              wsConnected ? 'Connected' : 'Disconnected'
            }}</span>
          </div>
          <button
            (click)="toggleAutoRefresh()"
            [class]="
              autoRefresh
                ? 'bg-stellar-blue/10 text-stellar-blue border-stellar-blue/30'
                : 'text-slate-400 border-slate-200 dark:border-slate-700'
            "
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <lucide-angular
              [img]="RefreshCwIcon"
              class="w-3.5 h-3.5"
              [class.animate-spin]="autoRefresh"
            ></lucide-angular>
            {{ autoRefresh ? 'Auto' : 'Manual' }}
          </button>
          <a routerLink="/sensors/config" class="btn btn-outline flex items-center gap-2 text-xs">
            <lucide-angular [img]="SettingsIcon" class="w-3.5 h-3.5"></lucide-angular>
            Configure
          </a>
        </div>
      </div>

      <div *ngIf="loading" class="flex items-center justify-center py-20">
        <app-skeleton-loader type="stat-card"></app-skeleton-loader>
      </div>

      <ng-container *ngIf="!loading">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div *ngFor="let param of parameterConfigs; trackBy: trackByParam" class="card p-4">
            <div class="flex items-center justify-between mb-3">
              <div class="flex items-center gap-2">
                <div
                  class="w-8 h-8 rounded-lg flex items-center justify-center"
                  [style.background]="param.color + '20'"
                >
                  <lucide-angular
                    [img]="param.icon"
                    class="w-4 h-4"
                    [style.color]="param.color"
                  ></lucide-angular>
                </div>
                <span
                  class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider"
                  >{{ param.label }}</span
                >
              </div>
              <div class="flex items-center gap-1.5">
                <span *ngIf="param.unit" class="text-xs text-slate-400">{{ param.unit }}</span>
                <span
                  class="w-2 h-2 rounded-full"
                  [class]="getStatusDot(param.key, getLatestValue(param.key))"
                ></span>
              </div>
            </div>
            <div class="flex items-baseline gap-1 mb-3">
              <span class="text-2xl font-bold text-slate-900 dark:text-white">
                {{
                  getLatestValue(param.key) != null
                    ? (getLatestValue(param.key) | number: '1.0-' + param.decimals)
                    : '--'
                }}
              </span>
              <span *ngIf="param.unit" class="text-xs text-slate-400">{{ param.unit }}</span>
            </div>
            <div class="flex items-end gap-px h-12">
              <div
                *ngFor="let val of sparklineData[param.key] || []; let i = index"
                class="flex-1 rounded-t transition-all duration-300"
                [style.height.%]="
                  sparklineMax[param.key] > 0 ? (val / sparklineMax[param.key]) * 100 : 0
                "
                [style.background]="param.color"
                [style.opacity]="0.3 + (i / (sparklineData[param.key]?.length || 1)) * 0.7"
              ></div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <app-sensor-chart
              [title]="'Recent Readings'"
              [series]="mainChartSeries"
              [height]="280"
              [timeRanges]="['1H', '6H', '24H', '7D', '30D']"
            />
          </div>
          <div class="card p-5">
            <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
              Latest Values
            </h3>
            <div *ngIf="!latestReading" class="text-center py-8 text-sm text-slate-400">
              No readings available
            </div>
            <div *ngIf="latestReading" class="space-y-3">
              <div
                *ngFor="let param of parameterConfigs; trackBy: trackByParam"
                class="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700 last:border-0"
              >
                <div class="flex items-center gap-2">
                  <div
                    class="w-6 h-6 rounded flex items-center justify-center"
                    [style.background]="param.color + '20'"
                  >
                    <lucide-angular
                      [img]="param.icon"
                      class="w-3 h-3"
                      [style.color]="param.color"
                    ></lucide-angular>
                  </div>
                  <span class="text-sm text-slate-600 dark:text-slate-400">{{ param.label }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-slate-900 dark:text-white">
                    {{
                      getLatestValue(param.key) != null
                        ? (getLatestValue(param.key) | number: '1.0-' + param.decimals)
                        : '--'
                    }}
                  </span>
                  <span
                    class="w-2 h-2 rounded-full"
                    [class]="getStatusDot(param.key, getLatestValue(param.key))"
                  ></span>
                </div>
              </div>
              <div class="pt-2 text-xs text-slate-400">
                Last updated: {{ latestReading.timestamp | dateFormat: 'relative' }}
              </div>
            </div>
          </div>
        </div>

        <div class="card p-5">
          <h3 class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
            Registered Devices
          </h3>
          <app-data-table
            [columns]="deviceColumns"
            [data]="devices"
            [loading]="false"
            emptyTitle="No devices registered"
            emptyMessage="Register a sensor device to start monitoring water quality."
          />
        </div>
      </ng-container>
    </div>
  `,
})
export class SensorsDashboardComponent implements OnInit, OnDestroy {
  protected loading = true;
  protected devices: SensorDevice[] = [];
  protected recentReadings: SensorReading[] = [];
  protected latestReading: SensorReading | null = null;
  protected wsConnected = false;
  protected autoRefresh = false;
  protected mainChartSeries: ChartSeries[] = [];
  protected sparklineData: Record<string, number[]> = {};
  protected sparklineMax: Record<string, number> = {};
  protected parameterConfigs = PARAMETER_CONFIGS;
  private refreshInterval = 30000;
  private destroy$ = new Subject<void>();
  /**
   * Drives the auto-refresh polling loop.
   * Emitting `true` starts a new interval; emitting `false` tears it down
   * (switchMap to EMPTY).  This guarantees at most one live interval at a
   * time and cancels cleanly on destroy$.
   */
  private autoRefresh$ = new BehaviorSubject<boolean>(false);

  protected readonly ActivityIcon = Activity;
  protected readonly DropletsIcon = Droplets;
  protected readonly ThermometerIcon = Thermometer;
  protected readonly GaugeIcon = Gauge;
  protected readonly WindIcon = Wind;
  protected readonly AtomIcon = Atom;
  protected readonly BeakerIcon = Beaker;
  protected readonly FlaskConicalIcon = FlaskConical;
  protected readonly RefreshCwIcon = RefreshCw;
  protected readonly SettingsIcon = Settings;
  protected readonly RadioIcon = Radio;

  protected deviceColumns: ColumnDef<SensorDevice>[] = [
    { key: 'deviceId', label: 'Device ID', sortable: true },
    { key: 'manufacturer', label: 'Manufacturer', sortable: true },
    { key: 'model', label: 'Model', sortable: true },
    { key: 'parameters', label: 'Parameters', sortable: false },
    { key: 'isActive', label: 'Status', sortable: true },
    { key: 'lastReadingAt', label: 'Last Reading', sortable: true },
  ];

  constructor(
    private store: Store<AppState>,
    private wsService: WebsocketService,
    private notificationService: NotificationService,
  ) {}

  ngOnInit(): void {
    // ── WebSocket connection status badge ──────────────────────────────────
    this.wsService.connected$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (connected) => {
        this.wsConnected = connected;
      },
      error: () => {},
    });

    // ── Device list from the store ─────────────────────────────────────────
    // Real-time readings flow through SensorsEffects.receiveSensorReading$
    // → store → selector; no direct WS subscription in the component.
    this.store
      .select(selectSensorDevices)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (devices) => {
          this.devices = devices;
        },
        error: () => {},
      });

    // ── Recent readings from the store ─────────────────────────────────────
    this.store
      .select(selectRecentReadings)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (readings) => {
          this.recentReadings = readings;
          this.updateDerivedData();
        },
        error: () => {},
      });

    // ── Loading state from the store ───────────────────────────────────────
    this.store
      .select(selectSensorsLoading)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (loading) => {
          this.loading = loading;
        },
        error: () => {},
      });

    // ── Auto-refresh polling ───────────────────────────────────────────────
    // switchMap guarantees only one interval is alive at a time.
    // When autoRefresh$ emits false (or destroy$ fires) the interval is
    // cancelled — no leak regardless of how many times the user toggles.
    this.autoRefresh$
      .pipe(
        switchMap((enabled) => (enabled ? interval(this.refreshInterval) : EMPTY)),
        takeUntil(this.destroy$),
      )
      .subscribe({
        next: () => {
          this.store.dispatch(SensorsActions.loadDevices({}));
        },
        error: () => {},
      });

    // Initial data load — delegate to the effect, not the service directly.
    this.store.dispatch(SensorsActions.loadDevices({}));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateDerivedData(): void {
    this.latestReading = this.recentReadings.length > 0 ? this.recentReadings[0] : null;

    const chartData: Record<string, { x: number; y: number }[]> = {};
    const sparklines: Record<string, number[]> = {};

    for (const param of this.parameterConfigs) {
      const values: number[] = [];
      const points: { x: number; y: number }[] = [];

      for (const r of this.recentReadings) {
        const val = (r as any)[param.key];
        if (val != null) {
          values.push(val as number);
          points.push({ x: new Date(r.timestamp).getTime(), y: val as number });
        }
      }

      sparklines[param.key] = values.slice(0, 20).reverse();
      this.sparklineMax[param.key] = values.length > 0 ? Math.max(...values, 0.001) : 1;

      if (points.length > 0) {
        chartData[param.key] = points.slice(0, 60).reverse();
      }
    }

    this.sparklineData = sparklines;
    this.mainChartSeries = this.parameterConfigs
      .filter((p) => chartData[p.key]?.length)
      .map((p) => ({ label: p.label, data: chartData[p.key]!, color: p.color }));
  }

  protected toggleAutoRefresh(): void {
    this.autoRefresh = !this.autoRefresh;
    // Push the new state; the autoRefresh$ pipe handles start/cancel.
    this.autoRefresh$.next(this.autoRefresh);
    if (this.autoRefresh) {
      this.notificationService.info(
        'Auto-refresh enabled',
        `Updating every ${this.refreshInterval / 1000}s`,
      );
    }
  }

  protected getLatestValue(paramKey: string): number | null {
    if (!this.latestReading) return null;
    return (this.latestReading as any)[paramKey] ?? null;
  }

  protected getStatusDot(paramKey: string, value: number | null): string {
    if (value == null) return 'bg-slate-300 dark:bg-slate-600';
    const thresholds = STATUS_THRESHOLDS[paramKey];
    if (!thresholds) return 'bg-slate-300 dark:bg-slate-600';
    const [goodMin, goodMax] = thresholds.good;
    const [warnMin, warnMax] = thresholds.warning;
    if (value >= goodMin && value <= goodMax) return 'bg-green-500';
    if (value >= warnMin && value <= warnMax) return 'bg-yellow-500';
    return 'bg-red-500';
  }

  protected trackByParam(_index: number, param: ParameterConfig): string {
    return param.key;
  }
}
