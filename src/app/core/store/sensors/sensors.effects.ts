import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Router, NavigationEnd } from '@angular/router';
import { WebsocketService } from '../../services/websocket.service';
import { NotificationService } from '../../services/notification.service';
import { SensorsService } from '../../services/sensors.service';
import * as SensorsActions from './sensors.actions';
import {
  filter,
  map,
  tap,
  mergeMap,
  startWith,
  pairwise,
  switchMap,
  catchError,
} from 'rxjs/operators';
import { from, of } from 'rxjs';

@Injectable()
export class SensorsEffects {
  private actions$ = inject(Actions);
  private wsService = inject(WebsocketService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);
  private sensorsService = inject(SensorsService);

  routeSubscription$ = createEffect(() =>
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => {
        const match = event.urlAfterRedirects.match(/\/(?:sensors|farmers\/parcels)\/([^/]+)/);
        const projectId = match && match[1] !== 'config' ? match[1] : null;
        return projectId;
      }),
      startWith(null as string | null),
      pairwise(),
      mergeMap(([prevId, currentId]) => {
        const actions = [];
        if (prevId && prevId !== currentId) {
          actions.push(SensorsActions.unsubscribeFromProject({ projectId: prevId }));
        }
        if (currentId && currentId !== prevId) {
          actions.push(SensorsActions.subscribeToProject({ projectId: currentId }));
        }
        return actions;
      }),
    ),
  );

  subscribeToProject$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SensorsActions.subscribeToProject),
        tap(({ projectId }) => {
          this.wsService.subscribeToProject(projectId);
        }),
      ),
    { dispatch: false },
  );

  unsubscribeFromProject$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SensorsActions.unsubscribeFromProject),
        tap(({ projectId }) => {
          this.wsService.unsubscribeFromProject(projectId);
        }),
      ),
    { dispatch: false },
  );

  loadDevices$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SensorsActions.loadDevices),
      switchMap(({ projectId }) =>
        from(this.sensorsService.getDevices(projectId)).pipe(
          map((devices) => SensorsActions.loadDevicesSuccess({ devices })),
          catchError((error) =>
            of(
              SensorsActions.loadDevicesFailure({
                error: error instanceof Error ? error.message : 'Failed to load devices',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  loadReadings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SensorsActions.loadReadings),
      switchMap(({ deviceId }) =>
        from(this.sensorsService.getReadings(deviceId)).pipe(
          map((readings) => SensorsActions.loadReadingsSuccess({ readings })),
          catchError((error) =>
            of(
              SensorsActions.loadReadingsFailure({
                error: error instanceof Error ? error.message : 'Failed to load readings',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  loadProjectReadings$ = createEffect(() =>
    this.actions$.pipe(
      ofType(SensorsActions.loadProjectReadings),
      mergeMap(({ projectId }) =>
        from(this.sensorsService.getLatestReadings(projectId)).pipe(
          map((readings) => SensorsActions.loadProjectReadingsSuccess({ projectId, readings })),
          catchError((error) =>
            of(
              SensorsActions.loadProjectReadingsFailure({
                projectId,
                error: error instanceof Error ? error.message : 'Failed to load project readings',
              }),
            ),
          ),
        ),
      ),
    ),
  );

  receiveSensorReading$ = createEffect(() =>
    this.wsService.sensorReadings$.pipe(
      map((data) => SensorsActions.receiveSensorReading({ data })),
    ),
  );

  receiveSensorAlert$ = createEffect(() =>
    this.wsService.sensorAlerts$.pipe(map((data) => SensorsActions.receiveSensorAlert({ data }))),
  );

  showAlertNotification$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(SensorsActions.receiveSensorAlert),
        tap(({ data }) => {
          const title = `Sensor Alert: ${data.parameter}`;
          if (data.severity === 'critical') {
            this.notificationService.error(title, data.message);
          } else if (data.severity === 'warning') {
            this.notificationService.warning(title, data.message);
          } else {
            this.notificationService.info(title, data.message);
          }
        }),
      ),
    { dispatch: false },
  );
}
