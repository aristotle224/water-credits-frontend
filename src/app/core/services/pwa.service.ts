import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  async clearDataCaches(): Promise<void> {
    if (typeof caches === 'undefined') {
      return;
    }
    try {
      const keys = await caches.keys();
      const deletePromises = keys
        .filter((key) => key.startsWith('ngsw:') && key.includes(':data'))
        .map((key) => caches.delete(key));
      await Promise.all(deletePromises);
    } catch {
      // Fail-safe catch block to handle any browser security context or storage exceptions.
    }
  }
}
