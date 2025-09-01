import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class Api {
  base = 'http://localhost:3000/api';
  constructor(private http: HttpClient) {}

  login(payload: { username: string; password: string }) {
    return this.http.post<{ user: any }>(`${this.base}/auth/login`, payload);
  }
}
