import { Injectable, InjectionToken, Optional, Inject } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { LoggingService } from './logging.service';
import { SensorReading, SensorAlert } from '../models/sensor-reading.model';

export type SocketIoFactory = (url: string, opts?: Parameters<typeof io>[1]) => Socket;

export const SOCKET_IO_FACTORY = new InjectionToken<SocketIoFactory>('SOCKET_IO_FACTORY', {
  providedIn: 'root',
  factory: () => io,
});

@Injectable({
  providedIn: 'root',
})
export class WebsocketService {
  private socket: Socket | null = null;
  private connectedSubject = new BehaviorSubject<boolean>(false);
  public connected$ = this.connectedSubject.asObservable();

  /**
   * Stable, multicast streams for sensor data.  Created once (not per access)
   * so that every subscriber shares the same socket listener and effects that
   * subscribe at app bootstrap keep working across logout → re-login cycles.
   * The subjects are intentionally never completed — completing them would
   * permanently tear down those long-lived subscriptions on disconnect().
   */
  private readonly sensorReadingsSubject = new Subject<SensorReading>();
  private readonly sensorAlertsSubject = new Subject<SensorAlert>();
  public readonly sensorReadings$: Observable<SensorReading> = new Observable<SensorReading>(
    (observer) => {
      const subscription = this.sensorReadingsSubject.subscribe(observer);
      this.ensureSensorHandlers();
      return () => subscription.unsubscribe();
    },
  );
  public readonly sensorAlerts$: Observable<SensorAlert> = new Observable<SensorAlert>(
    (observer) => {
      const subscription = this.sensorAlertsSubject.subscribe(observer);
      this.ensureSensorHandlers();
      return () => subscription.unsubscribe();
    },
  );

  /** Stable handler references so they can be removed precisely on teardown. */
  private readonly handleSensorReading = (data: SensorReading): void => {
    this.sensorReadingsSubject.next(data);
  };
  private readonly handleSensorAlert = (data: SensorAlert): void => {
    this.sensorAlertsSubject.next(data);
  };

  /**
   * Whether the stable sensor handlers are currently registered on the active
   * socket. The handlers are attached lazily — only while at least one
   * subscriber exists on either multicast stream — so that generic `on<T>()`
   * listeners for the same event names remain isolated and independently
   * ref-counted.
   */
  private sensorHandlersAttached = false;
  private socketIoFactory: SocketIoFactory;

  constructor(
    private loggingService: LoggingService,
    @Optional() @Inject(SOCKET_IO_FACTORY) socketIoFactory?: SocketIoFactory,
  ) {
    this.socketIoFactory = socketIoFactory ?? io;
  }

  /** Register the stable sensor handlers on the current socket, if needed. */
  private attachSensorHandlers(): void {
    if (!this.socket || this.sensorHandlersAttached) {
      return;
    }
    this.socket.on('sensor:reading', this.handleSensorReading);
    this.socket.on('sensor:alert', this.handleSensorAlert);
    this.sensorHandlersAttached = true;
  }

  /** Remove the stable sensor handlers from the current socket, if present. */
  private detachSensorHandlers(): void {
    if (!this.socket || !this.sensorHandlersAttached) {
      return;
    }
    this.socket.off('sensor:reading', this.handleSensorReading);
    this.socket.off('sensor:alert', this.handleSensorAlert);
    this.sensorHandlersAttached = false;
  }

  /**
   * Lazily wires the socket to the multicast subjects: the first subscriber
   * to either stream attaches the stable handlers; connect() re-attaches them
   * when subscribers already exist.
   */
  private ensureSensorHandlers(): void {
    if (!this.socket) {
      return;
    }
    if (this.sensorReadingsSubject.observed || this.sensorAlertsSubject.observed) {
      this.attachSensorHandlers();
    }
  }

  connect(token: string, userId: string): void {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = this.socketIoFactory(`${environment.wsUrl}/notifications`, {
      query: { token, userId },
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
    });

    this.socket.on('connect', () => {
      this.connectedSubject.next(true);
      this.loggingService.info('Connected to WebSocket');
    });

    this.socket.on('disconnect', () => {
      this.connectedSubject.next(false);
      this.loggingService.info('Disconnected from WebSocket');
    });

    this.socket.on('connect_error', (error) => {
      this.loggingService.error('WebSocket connection error:', error);
    });

    // Fan sensor events into the shared multicast subjects — but only when
    // someone is actually subscribed to them, so that `on<T>()` listeners for
    // the same event names stay isolated (see on() tests).
    this.ensureSensorHandlers();
  }

  disconnect(): void {
    if (this.socket) {
      this.detachSensorHandlers();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  on<T = unknown>(event: string): Observable<T> {
    return new Observable<T>((observer) => {
      if (!this.socket) {
        observer.error(new Error(`WebSocket not connected; cannot listen to "${event}"`));
        return;
      }

      // Capture the handler reference so that teardown removes only this
      // subscriber's listener, leaving any other subscriber for the same
      // event name untouched.
      const handler = (data: T): void => observer.next(data);
      this.socket.on(event, handler);

      return () => {
        // Pass the exact handler reference — socket.off(event) with no
        // second argument would remove ALL listeners for this event.
        this.socket?.off(event, handler);
      };
    });
  }

  emit(event: string, data?: unknown): void {
    if (this.socket) {
      this.socket.emit(event, data);
    }
  }

  subscribeToProject(projectId: string): void {
    this.emit('subscribe:project', { projectId });
  }

  unsubscribeFromProject(projectId: string): void {
    this.emit('unsubscribe:project', { projectId });
  }
}
