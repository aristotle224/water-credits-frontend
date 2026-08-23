import { TestBed } from '@angular/core/testing';
import { provideMockActions } from '@ngrx/effects/testing';
import { Subject, of } from 'rxjs';
import { Action } from '@ngrx/store';
import { Router, NavigationEnd } from '@angular/router';
import { SensorsEffects } from './sensors.effects';
import * as SensorsActions from './sensors.actions';
import { WebsocketService } from '../../services/websocket.service';
import { NotificationService } from '../../services/notification.service';
import { SensorsService } from '../../services/sensors.service';
import { SensorDevice, SensorReading, SensorAlert } from '../../models/sensor-reading.model';
import { firstValueFrom } from 'rxjs';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('SensorsEffects', () => {
  let effects: SensorsEffects;
  let actions$: Subject<Action>;
  let wsServiceMock: any;
  let notificationServiceMock: any;
  let sensorsServiceMock: any;
  let routerEvents$: Subject<any>;
  let routerMock: any;

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
    id: 'reading-123',
    deviceId: 'device-1',
    projectId: 'project-1',
    timestamp: new Date().toISOString(),
    ph: 7.2,
    signature: 'sig',
    isVerified: true,
  };

  const mockAlert: SensorAlert = {
    id: 'alert-123',
    projectId: 'project-1',
    deviceId: 'device-1',
    parameter: 'ph',
    value: 9.5,
    threshold: 8.5,
    severity: 'critical',
    message: 'pH level too high',
    timestamp: new Date().toISOString(),
  };

  const sensorReadingsSubject = new Subject<SensorReading>();
  const sensorAlertsSubject = new Subject<SensorAlert>();

  beforeEach(() => {
    actions$ = new Subject<Action>();
    routerEvents$ = new Subject<any>();

    wsServiceMock = {
      connected$: of(true),
      sensorReadings$: sensorReadingsSubject.asObservable(),
      sensorAlerts$: sensorAlertsSubject.asObservable(),
      subscribeToProject: vi.fn(),
      unsubscribeFromProject: vi.fn(),
    };

    notificationServiceMock = {
      info: vi.fn(),
      warning: vi.fn(),
      error: vi.fn(),
      show: vi.fn(),
    };

    sensorsServiceMock = {
      getDevices: vi.fn().mockResolvedValue([]),
      getReadings: vi.fn().mockResolvedValue([]),
      getLatestReadings: vi.fn().mockResolvedValue([]),
    };

    routerMock = {
      events: routerEvents$.asObservable(),
    };

    TestBed.configureTestingModule({
      providers: [
        SensorsEffects,
        provideMockActions(() => actions$),
        { provide: WebsocketService, useValue: wsServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: SensorsService, useValue: sensorsServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    });

    effects = TestBed.inject(SensorsEffects);
  });

  describe('routeSubscription$', () => {
    it('dispatches subscribeToProject and unsubscribeFromProject when navigating between dashboards', async () => {
      const results: Action[] = [];
      const sub = effects.routeSubscription$.subscribe((action) => results.push(action));

      // 1. Navigate to project-1
      routerEvents$.next(new NavigationEnd(1, '/sensors/project-1', '/sensors/project-1'));
      expect(results.length).toBe(1);
      expect(results[0]).toEqual(SensorsActions.subscribeToProject({ projectId: 'project-1' }));

      // 2. Navigate to project-2
      routerEvents$.next(new NavigationEnd(2, '/sensors/project-2', '/sensors/project-2'));
      expect(results.length).toBe(3); // Unsubscribe project-1, Subscribe project-2
      expect(results[1]).toEqual(SensorsActions.unsubscribeFromProject({ projectId: 'project-1' }));
      expect(results[2]).toEqual(SensorsActions.subscribeToProject({ projectId: 'project-2' }));

      // 3. Navigate away to dashboard
      routerEvents$.next(new NavigationEnd(3, '/dashboard', '/dashboard'));
      expect(results.length).toBe(4); // Unsubscribe project-2
      expect(results[3]).toEqual(SensorsActions.unsubscribeFromProject({ projectId: 'project-2' }));

      sub.unsubscribe();
    });
  });

  describe('subscribeToProject$', () => {
    it('calls subscribeToProject on websocket service', async () => {
      const sub = effects.subscribeToProject$.subscribe();
      actions$.next(SensorsActions.subscribeToProject({ projectId: 'project-1' }));

      expect(wsServiceMock.subscribeToProject).toHaveBeenCalledWith('project-1');
      sub.unsubscribe();
    });
  });

  describe('unsubscribeFromProject$', () => {
    it('calls unsubscribeFromProject on websocket service', async () => {
      const sub = effects.unsubscribeFromProject$.subscribe();
      actions$.next(SensorsActions.unsubscribeFromProject({ projectId: 'project-1' }));

      expect(wsServiceMock.unsubscribeFromProject).toHaveBeenCalledWith('project-1');
      sub.unsubscribe();
    });
  });

  describe('loadDevices$', () => {
    it('emits loadDevicesSuccess with devices on successful fetch', async () => {
      sensorsServiceMock.getDevices.mockResolvedValue([mockDevice]);
      const resultPromise = firstValueFrom(effects.loadDevices$);
      actions$.next(SensorsActions.loadDevices({ projectId: 'project-1' }));
      const action = await resultPromise;

      expect(sensorsServiceMock.getDevices).toHaveBeenCalledWith('project-1');
      expect(action).toEqual(
        SensorsActions.loadDevicesSuccess({
          devices: [mockDevice],
        }),
      );
    });

    it('emits loadDevicesFailure on error', async () => {
      sensorsServiceMock.getDevices.mockRejectedValue(new Error('Network error'));
      const resultPromise = firstValueFrom(effects.loadDevices$);
      actions$.next(SensorsActions.loadDevices({}));
      const action = await resultPromise;

      expect(sensorsServiceMock.getDevices).toHaveBeenCalledWith(undefined);
      expect(action).toEqual(
        SensorsActions.loadDevicesFailure({
          error: 'Network error',
        }),
      );
    });
  });

  describe('loadReadings$', () => {
    it('emits loadReadingsSuccess with readings on successful fetch', async () => {
      sensorsServiceMock.getReadings.mockResolvedValue([mockReading]);
      const resultPromise = firstValueFrom(effects.loadReadings$);
      actions$.next(SensorsActions.loadReadings({ deviceId: 'device-1' }));
      const action = await resultPromise;

      expect(sensorsServiceMock.getReadings).toHaveBeenCalledWith('device-1');
      expect(action).toEqual(
        SensorsActions.loadReadingsSuccess({
          readings: [mockReading],
        }),
      );
    });

    it('emits loadReadingsFailure on error', async () => {
      sensorsServiceMock.getReadings.mockRejectedValue(new Error('Readings fetch failed'));
      const resultPromise = firstValueFrom(effects.loadReadings$);
      actions$.next(SensorsActions.loadReadings({ deviceId: 'device-1' }));
      const action = await resultPromise;

      expect(sensorsServiceMock.getReadings).toHaveBeenCalledWith('device-1');
      expect(action).toEqual(
        SensorsActions.loadReadingsFailure({
          error: 'Readings fetch failed',
        }),
      );
    });
  });

  describe('loadProjectReadings$', () => {
    it('emits loadProjectReadingsSuccess with readings', async () => {
      sensorsServiceMock.getLatestReadings.mockResolvedValue([mockReading]);
      const resultPromise = firstValueFrom(effects.loadProjectReadings$);
      actions$.next(SensorsActions.loadProjectReadings({ projectId: 'project-1' }));
      const action = await resultPromise;

      expect(sensorsServiceMock.getLatestReadings).toHaveBeenCalledWith('project-1');
      expect(action).toEqual(
        SensorsActions.loadProjectReadingsSuccess({
          projectId: 'project-1',
          readings: [mockReading],
        }),
      );
    });

    it('emits loadProjectReadingsFailure on error', async () => {
      sensorsServiceMock.getLatestReadings.mockRejectedValue(new Error('Project readings error'));
      const resultPromise = firstValueFrom(effects.loadProjectReadings$);
      actions$.next(SensorsActions.loadProjectReadings({ projectId: 'project-1' }));
      const action = await resultPromise;

      expect(sensorsServiceMock.getLatestReadings).toHaveBeenCalledWith('project-1');
      expect(action).toEqual(
        SensorsActions.loadProjectReadingsFailure({
          projectId: 'project-1',
          error: 'Project readings error',
        }),
      );
    });
  });

  describe('receiveSensorReading$', () => {
    it('maps incoming sensor readings to receiveSensorReading action', async () => {
      const resultPromise = firstValueFrom(effects.receiveSensorReading$);
      sensorReadingsSubject.next(mockReading);
      const action = await resultPromise;

      expect(action).toEqual(SensorsActions.receiveSensorReading({ data: mockReading }));
    });
  });

  describe('receiveSensorAlert$', () => {
    it('maps incoming sensor alerts to receiveSensorAlert action', async () => {
      const resultPromise = firstValueFrom(effects.receiveSensorAlert$);
      sensorAlertsSubject.next(mockAlert);
      const action = await resultPromise;

      expect(action).toEqual(SensorsActions.receiveSensorAlert({ data: mockAlert }));
    });
  });

  describe('showAlertNotification$', () => {
    it('triggers error notification for critical alert', () => {
      const sub = effects.showAlertNotification$.subscribe();
      actions$.next(SensorsActions.receiveSensorAlert({ data: mockAlert }));

      expect(notificationServiceMock.error).toHaveBeenCalledWith(
        'Sensor Alert: ph',
        'pH level too high',
      );
      sub.unsubscribe();
    });

    it('triggers warning notification for warning alert', () => {
      const sub = effects.showAlertNotification$.subscribe();
      actions$.next(
        SensorsActions.receiveSensorAlert({
          data: { ...mockAlert, severity: 'warning', message: 'pH warning' },
        }),
      );

      expect(notificationServiceMock.warning).toHaveBeenCalledWith(
        'Sensor Alert: ph',
        'pH warning',
      );
      sub.unsubscribe();
    });

    it('triggers info notification for info alert', () => {
      const sub = effects.showAlertNotification$.subscribe();
      actions$.next(
        SensorsActions.receiveSensorAlert({
          data: { ...mockAlert, severity: 'info', message: 'pH normal again' },
        }),
      );

      expect(notificationServiceMock.info).toHaveBeenCalledWith(
        'Sensor Alert: ph',
        'pH normal again',
      );
      sub.unsubscribe();
    });
  });
});
