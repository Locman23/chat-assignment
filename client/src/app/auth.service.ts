import { Injectable, signal, computed } from '@angular/core';
import { Storage } from './storage.service';

export interface User {
  id: string;
  username: string;
  email?: string;
  roles: string[];
  groups: string[];
  avatarUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private _user = signal<User | null>(null);
  user = computed(() => this._user());

  constructor(private store: Storage) {
    const saved = this.store.get<User>('auth_user');
    if (saved) this._user.set(saved);
  }

  login(user: User) {
    this._user.set(user);
    this.store.set('auth_user', user);
  }
  logout() {
    this._user.set(null);
    this.store.remove('auth_user');
  }
  hasRole(role: string) { return this._user()?.roles.includes(role) ?? false; }
  isAuthed() { return !!this._user(); }
  id() { return this._user()?.id ?? ''; }
}
