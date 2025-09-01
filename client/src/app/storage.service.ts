import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class Storage {
  get<T>(key: string): T | null {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  }
  set<T>(key: string, value: T) { localStorage.setItem(key, JSON.stringify(value)); }
  remove(key: string) { localStorage.removeItem(key); }
}
