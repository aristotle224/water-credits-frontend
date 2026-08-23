import { TestBed } from '@angular/core/testing';
import { PwaService } from './pwa.service';

describe('PwaService', () => {
  let service: PwaService;
  let originalCaches: any;

  beforeEach(() => {
    originalCaches = (globalThis as any).caches;
    TestBed.configureTestingModule({});
    service = TestBed.inject(PwaService);
  });

  afterEach(() => {
    (globalThis as any).caches = originalCaches;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should be a no-op when caches is undefined', async () => {
    (globalThis as any).caches = undefined;
    await expect(service.clearDataCaches()).resolves.not.toThrow();
  });

  it('should delete ngsw:* data-group caches and leave asset/control caches untouched', async () => {
    const deletedKeys: string[] = [];
    /**
     * Real Angular SW cache key format (sourced from ngsw-worker.js):
     *   Root NamedCacheStorage prefix:  ngsw:${scope.path}  e.g. "ngsw:/"
     *   Data group HTTP cache:          ngsw:/:${config.version}:data:${name}:cache
     *   Data group DB lru/age tables:   ngsw:/:db:${config.version}:data:${name}:lru|age
     *   Asset group HTTP cache:         ngsw:/:${manifestHash}:assets:${name}:cache
     *   Asset group DB meta table:      ngsw:/:db:${manifestHash}:assets:${name}:meta
     *   Control table:                  ngsw:/:db:control
     */
    const mockCacheKeys = [
      'ngsw:/:db:control',
      'ngsw:/:abc123:assets:app-shell:cache',
      'ngsw:/:db:abc123:assets:app-shell:meta',
      'ngsw:/:1:data:api-freshness:cache',
      'ngsw:/:db:1:data:api-freshness:age',
      'ngsw:/:db:1:data:api-freshness:lru',
      'other-cache',
    ];

    const mockCaches = {
      keys: vi.fn().mockResolvedValue(mockCacheKeys),
      delete: vi.fn().mockImplementation((key: string) => {
        deletedKeys.push(key);
        return Promise.resolve(true);
      }),
    };

    (globalThis as any).caches = mockCaches as any;

    await service.clearDataCaches();

    expect(mockCaches.keys).toHaveBeenCalled();

    expect(deletedKeys).toContain('ngsw:/:1:data:api-freshness:cache');
    expect(deletedKeys).toContain('ngsw:/:db:1:data:api-freshness:age');
    expect(deletedKeys).toContain('ngsw:/:db:1:data:api-freshness:lru');

    expect(deletedKeys).not.toContain('ngsw:/:db:control');
    expect(deletedKeys).not.toContain('ngsw:/:abc123:assets:app-shell:cache');
    expect(deletedKeys).not.toContain('ngsw:/:db:abc123:assets:app-shell:meta');
    expect(deletedKeys).not.toContain('other-cache');
  });
});
