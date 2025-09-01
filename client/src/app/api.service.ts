import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Injectable({ providedIn: 'root' })
export class Api {
  base = 'http://localhost:3000/api';
  constructor(private http: HttpClient) {}

  login(payload: { username: string; password: string }) {
    return this.http.post<{ user: any }>(`${this.base}/auth/login`, payload);
  }

  addUser(payload: { username: string; email: string }) {
    return this.http.post<{ user: any }>(`${this.base}/users`, payload);
  }

  getUsers() {
    return this.http.get<{ users: any[] }>(`${this.base}/users`);
  }

  getChannels(groupId: string) {
    return this.http.get<{ channels: any[] }>(`${this.base}/groups/${groupId}/channels`);
  }

  addChannel(groupId: string, payload: { name: string }) {
    return this.http.post<{ channel: any }>(`${this.base}/groups/${groupId}/channels`, payload);
  }

  getGroupMembers(groupId: string) {
    return this.http.get<{ members: string[] }>(`${this.base}/groups/${groupId}`);
  }

  addGroupMember(groupId: string, payload: { username: string }) {
    return this.http.post<{ members: string[] }>(`${this.base}/groups/${groupId}/members`, payload);
  }

  getGroups() {
    return this.http.get<{ groups: any[] }>(`${this.base}/groups`);
  }

  addGroup(payload: { name: string; ownerUsername: string }) {
    return this.http.post<{ group: any }>(`${this.base}/groups`, payload);
  }
}
