import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnDestroy,
  AfterViewInit,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  Inject,
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import * as L from 'leaflet';
import { environment } from '../../../../environments/environment';

// Leaflet/webpack workaround: delete the default _getIconUrl method to fix marker icon paths
// This is a known issue where Leaflet's default icon paths don't work with webpack bundling
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
  label?: string;
  status?: string;
  popupContent?: string;
}

/** Emitted by drawMode 'pin', 'polygon', or 'pin+polygon'. */
export interface MapLocation {
  /** Dropped pin / polygon centroid. */
  center: { lat: number; lng: number };
  /** GeoJSON Polygon describing the drawn boundary, or null if only a pin was placed. */
  boundary: GeoJSON.Polygon | null;
}

export type MapDrawMode = 'none' | 'pin' | 'polygon' | 'pin+polygon';

@Component({
  selector: 'app-map-view',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="space-y-2">
      <div
        class="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700"
        [style.height.px]="height"
      >
        <div #mapContainer class="w-full h-full"></div>
      </div>

      <!-- Draw-mode instructions -->
      <p *ngIf="drawMode !== 'none'" class="text-xs text-slate-400 select-none">
        <ng-container *ngIf="drawMode === 'pin'">
          Click the map to drop the project pin.
        </ng-container>
        <ng-container *ngIf="drawMode === 'polygon'">
          Click to add polygon vertices &middot; double-click to close the shape.
        </ng-container>
        <ng-container *ngIf="drawMode === 'pin+polygon'">
          <span *ngIf="!pinPlaced">Step 1: Click to drop the project headquarters pin.</span>
          <span *ngIf="pinPlaced && !polygonClosed">
            Step 2: Click to draw the project boundary &middot; double-click to close.
            <button
              type="button"
              (click)="resetDraw()"
              class="ml-2 text-stellar-blue underline text-xs"
            >
              Reset
            </button>
          </span>
          <span *ngIf="polygonClosed" class="text-environmental-green font-medium">
            Location set.
            <button
              type="button"
              (click)="resetDraw()"
              class="ml-2 text-stellar-blue underline text-xs"
            >
              Redraw
            </button>
          </span>
        </ng-container>
      </p>
    </div>
  `,
})
export class MapViewComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() markers: MapMarker[] = [];
  @Input() height = 400;
  @Input() centerLat = 20;
  @Input() centerLng = 0;
  @Input() zoom = 2;
  @Input() clickable = false;
  /** Controls interactive drawing mode. */
  @Input() drawMode: MapDrawMode = 'none';

  /** Emitted once the user has completed the required draw gesture. */
  @Output() locationPicked = new EventEmitter<MapLocation>();

  /** Emitted when a read-only marker is clicked (requires clickable=true). */
  @Output() markerClick = new EventEmitter<MapMarker>();

  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLDivElement>;

  private map: L.Map | null = null;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  // â”€â”€ draw state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  protected pinPlaced = false;
  protected polygonClosed = false;

  private pinMarker: L.Marker | null = null;
  private polylineLayer: L.Polyline | null = null;
  private polygonLayer: L.Polygon | null = null;
  private polyVertices: L.LatLng[] = [];

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) return;
    if (changes['markers']) {
      this.clearReadOnlyMarkers();
      this.addMarkers();
    }
    if (changes['drawMode']) {
      this.resetDraw();
      this.bindDrawListeners();
    }
  }

  ngOnDestroy(): void {
    this.map?.remove();
  }

  // â”€â”€ public reset â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  resetDraw(): void {
    this.pinPlaced = false;
    this.polygonClosed = false;
    this.polyVertices = [];
    this.pinMarker?.remove();
    this.pinMarker = null;
    this.polylineLayer?.remove();
    this.polylineLayer = null;
    this.polygonLayer?.remove();
    this.polygonLayer = null;
  }

  // â”€â”€ init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private initMap(): void {
    // Guard against SSR: Leaflet requires a real DOM element
    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    this.map = L.map(this.mapContainer.nativeElement, {
      center: [this.centerLat, this.centerLng],
      zoom: this.zoom,
      zoomControl: true,
      scrollWheelZoom: true,
    });

    L.tileLayer(environment.map.tileUrl, {
      attribution: environment.map.attribution,
      maxZoom: 19,
    }).addTo(this.map);

    this.addMarkers();

    if (this.drawMode !== 'none') {
      this.bindDrawListeners();
    }
  }

  // â”€â”€ marker rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private _readOnlyMarkerLayers: L.Marker[] = [];

  private clearReadOnlyMarkers(): void {
    this._readOnlyMarkerLayers.forEach((m) => m.remove());
    this._readOnlyMarkerLayers = [];
  }

  private addMarkers(): void {
    this.markers.forEach((marker) => {
      const color = this.getStatusColor(marker.status);
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>`,
        iconSize: [12, 12],
        iconAnchor: [6, 6],
      });

      const m = L.marker([marker.latitude, marker.longitude], { icon }).addTo(this.map!);

      if (marker.popupContent) {
        m.bindPopup(marker.popupContent);
      }

      if (this.clickable) {
        m.on('click', () => this.markerClick.emit(marker));
      }

      this._readOnlyMarkerLayers.push(m);
    });

    if (this.markers.length > 0) {
      const bounds = L.latLngBounds(
        this.markers.map((m) => [m.latitude, m.longitude] as [number, number]),
      );
      this.map?.fitBounds(bounds, { padding: [50, 50] });
    }
  }

  // â”€â”€ draw interaction â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private boundClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;
  private boundDblClickHandler: ((e: L.LeafletMouseEvent) => void) | null = null;

  private bindDrawListeners(): void {
    if (!this.map) return;

    // Remove existing listeners first
    if (this.boundClickHandler) this.map.off('click', this.boundClickHandler);
    if (this.boundDblClickHandler) this.map.off('dblclick', this.boundDblClickHandler);

    if (this.drawMode === 'none') return;

    this.boundClickHandler = (e: L.LeafletMouseEvent) => this.onMapClick(e);
    this.boundDblClickHandler = (e: L.LeafletMouseEvent) => this.onMapDblClick(e);

    this.map.on('click', this.boundClickHandler);
    this.map.on('dblclick', this.boundDblClickHandler);
  }

  private onMapClick(e: L.LeafletMouseEvent): void {
    const latlng = e.latlng;

    if (this.drawMode === 'pin') {
      this.placePin(latlng);
      this.emit();
      return;
    }

    if (this.drawMode === 'polygon') {
      if (this.polygonClosed) return;
      this.addPolyVertex(latlng);
      return;
    }

    if (this.drawMode === 'pin+polygon') {
      if (!this.pinPlaced) {
        this.placePin(latlng);
        this.pinPlaced = true;
        return;
      }
      if (!this.polygonClosed) {
        this.addPolyVertex(latlng);
      }
    }
  }

  private onMapDblClick(e: L.LeafletMouseEvent): void {
    // Prevent Leaflet's default double-click zoom
    L.DomEvent.stopPropagation(e.originalEvent);
    L.DomEvent.preventDefault(e.originalEvent);

    if (this.drawMode === 'polygon' || this.drawMode === 'pin+polygon') {
      if (!this.polygonClosed && this.polyVertices.length >= 3) {
        this.closePolygon();
      }
    }
  }

  private placePin(latlng: L.LatLng): void {
    this.pinMarker?.remove();
    this.pinMarker = L.marker(latlng, {
      icon: L.divIcon({
        className: 'draw-pin',
        html: `<div style="background:#7B2FBE;width:14px;height:14px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(this.map!);
  }

  private addPolyVertex(latlng: L.LatLng): void {
    this.polyVertices.push(latlng);
    this.polylineLayer?.remove();
    this.polylineLayer = L.polyline(this.polyVertices, {
      color: '#7B2FBE',
      weight: 2,
      dashArray: '6 4',
    }).addTo(this.map!);
  }

  private closePolygon(): void {
    if (this.polyVertices.length < 3) return;
    this.polylineLayer?.remove();
    this.polylineLayer = null;
    this.polygonLayer?.remove();
    this.polygonLayer = L.polygon(this.polyVertices, {
      color: '#7B2FBE',
      weight: 2,
      fillColor: '#7B2FBE',
      fillOpacity: 0.15,
    }).addTo(this.map!);
    this.polygonClosed = true;
    this.emit();
  }

  private emit(): void {
    const center = this.pinMarker
      ? this.pinMarker.getLatLng()
      : this.polygonLayer
        ? this.polygonLayer.getBounds().getCenter()
        : null;

    if (!center) return;

    let boundary: GeoJSON.Polygon | null = null;
    if (this.polygonLayer) {
      const coords = this.polyVertices.map((v) => [v.lng, v.lat] as [number, number]);
      // Close the ring
      coords.push(coords[0]);
      boundary = { type: 'Polygon', coordinates: [coords] };
    }

    const readyPin = this.drawMode === 'pin' || (this.drawMode === 'pin+polygon' && this.pinPlaced);
    const readyPoly =
      this.drawMode === 'polygon' || (this.drawMode === 'pin+polygon' && this.polygonClosed);
    const readyNone = this.drawMode === 'none';

    if (readyNone) return;
    if (this.drawMode === 'pin' && readyPin) {
      this.locationPicked.emit({ center: { lat: center.lat, lng: center.lng }, boundary: null });
    } else if (this.drawMode === 'polygon' && readyPoly && this.polygonClosed) {
      this.locationPicked.emit({ center: { lat: center.lat, lng: center.lng }, boundary });
    } else if (this.drawMode === 'pin+polygon' && this.pinPlaced && this.polygonClosed) {
      this.locationPicked.emit({ center: { lat: center.lat, lng: center.lng }, boundary });
    }
  }

  // â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private getStatusColor(status?: string): string {
    switch (status) {
      case 'active':
        return '#10B981';
      case 'baseline':
        return '#3B82F6';
      case 'registered':
        return '#7B2FBE';
      case 'completed':
        return '#059669';
      case 'closed':
        return '#EF4444';
      default:
        return '#94A3B8';
    }
  }
}
