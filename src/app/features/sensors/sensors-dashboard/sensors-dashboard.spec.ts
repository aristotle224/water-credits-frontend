import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideMockStore, MockStore } from '@ngrx/store/testing';
import { of } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { Store } from '@ngrx/store';

import { SensorsDashboardComponent } from './sensors-dashboard';
import { WebsocketService } from '../../../core/services/websocket.service';
import { NotificationService } from '../../../core/services/notification.service';
import * as SensorsActions from '../../../core/store/sensors/sensors.actions';
import {
  selectSensorDevices,
  selectRecentReadings,
  selectSensorsLoading,
} from '../../../core/store/sensors/sensors.selectors';
import { SensorDevice, SensorReading } from '../../../core/models/sensor-reading.model';

describe('SensorsDashboardComponent', () => {
  let component: SensorsDashboardComponent;
  let fixture: ComponentFixture<SensorsDashboardComponent>;
  let store: MockStore;
  let notificationServiceMock: any;

  const mockDevice: SensorDevice = {
    id: 'device-1',
    deviceId: 'device-1',
    projectId: 'project-1',
    manufacturer: 'Acme Sensors',
    model: 'AQ-100',
    parameters: ['ph', 'turbidity'],
    publicKey: 'GABC123',
    isActive: true,
    lastReadingAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  const mockReading: SensorReading = {
    id: 'reading-1',
    deviceId: 'device-1',
    projectId: 'project-1',
    timestamp: new Date().toISOString(),
    ph: 7.4,
    turbidity: 3.2,
    dissolvedOxygen: 8.1,
    flowRate: 1.2,
    temperature: 20.5,
    signature: 'sig',
    isVerified: true,
  };

  const initialState = {
    sensors: {
      devices: [],
      readings: [],
      readingsByProjectId: {},
      recentReadings: [],
      realTimeBuffer: [],
      alerts: [],
      summary: null,
      loading: false,
      error: null,
    },
  };

  beforeEach(async () => {
    notificationServiceMock = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      show: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SensorsDashboardComponent],
      providers: [
        provideRouter([]),
        provideMockStore({ initialState }),
        {
          provide: WebsocketService,
          useValue: {
            connected$: of(true),
            on: () => of(),
          },
        },
        {
          provide: NotificationService,
          useValue: notificationServiceMock,
        },
      ],
    }).compileComponents();

    store = TestBed.inject(Store) as MockStore;
    vi.spyOn(store, 'dispatch');
    fixture = TestBed.createComponent(SensorsDashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should dispatch SensorsActions.loadDevices on init', () => {
    fixture.detectChanges();
    expect(store.dispatch).toHaveBeenCalledWith(SensorsActions.loadDevices({}));
  });

  it('should update devices from selectSensorDevices selector', () => {
    store.overrideSelector(selectSensorDevices, [mockDevice]);
    fixture.detectChanges();

    expect((component as any).devices).toEqual([mockDevice]);
  });

  it('should update recentReadings and derive latestReading and sparklines', () => {
    store.overrideSelector(selectRecentReadings, [mockReading]);
    fixture.detectChanges();

    expect((component as any).recentReadings).toEqual([mockReading]);
    expect((component as any).latestReading).toEqual(mockReading);
    expect((component as any).getLatestValue('ph')).toBe(7.4);
    expect((component as any).getLatestValue('turbidity')).toBe(3.2);
  });

  it('should update loading state from selectSensorsLoading selector', () => {
    store.overrideSelector(selectSensorsLoading, true);
    fixture.detectChanges();

    expect((component as any).loading).toBe(true);

    store.overrideSelector(selectSensorsLoading, false);
    store.refreshState();
    fixture.detectChanges();

    expect((component as any).loading).toBe(false);
  });

  it('should toggle auto-refresh and notify user', () => {
    fixture.detectChanges();
    expect((component as any).autoRefresh).toBe(false);

    (component as any).toggleAutoRefresh();
    expect((component as any).autoRefresh).toBe(true);
    expect(notificationServiceMock.info).toHaveBeenCalledWith(
      'Auto-refresh enabled',
      expect.stringContaining('Updating every'),
    );

    (component as any).toggleAutoRefresh();
    expect((component as any).autoRefresh).toBe(false);
  });
});
