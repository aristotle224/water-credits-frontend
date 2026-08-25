import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MapViewComponent } from './map-view';
import { PLATFORM_ID } from '@angular/core';

describe('MapViewComponent', () => {
  let component: MapViewComponent;
  let fixture: ComponentFixture<MapViewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapViewComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'browser' }],
    }).compileComponents();

    fixture = TestBed.createComponent(MapViewComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have default input values', () => {
    expect(component.markers).toEqual([]);
    expect(component.height).toBe(400);
    expect(component.centerLat).toBe(20);
    expect(component.centerLng).toBe(0);
    expect(component.zoom).toBe(2);
    expect(component.clickable).toBe(false);
  });

  it('should reset draw state when resetDraw is called', () => {
    // Set some draw state
    (component as any).pinPlaced = true;
    (component as any).polygonClosed = true;
    (component as any).polyVertices = [{ lat: 10, lng: 20 }];

    component.resetDraw();

    expect((component as any).pinPlaced).toBe(false);
    expect((component as any).polygonClosed).toBe(false);
    expect((component as any).polyVertices).toEqual([]);
  });

  it('should not throw in SSR context', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MapViewComponent],
      providers: [{ provide: PLATFORM_ID, useValue: 'server' }],
    });

    const ssrFixture = TestBed.createComponent(MapViewComponent);
    const ssrComponent = ssrFixture.componentInstance;

    expect(() => {
      ssrFixture.detectChanges();
    }).not.toThrow();
    expect(ssrComponent).toBeTruthy();
  });
});
