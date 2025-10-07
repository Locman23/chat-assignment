import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from './config';

@Injectable({ providedIn: 'root' })
export class Api {
  base = API_BASE;
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

  addChannel(groupId: string, payload: { name: string; requester?: string }) {
    return this.http.post<{ channel: any }>(`${this.base}/groups/${groupId}/channels`, payload);
  }

  getGroupMembers(groupId: string) {
    return this.http.get<{ members: string[] }>(`${this.base}/groups/${groupId}`);
  }

  addGroupMember(groupId: string, payload: { username: string; requester?: string }) {
    return this.http.post<{ members: string[] }>(`${this.base}/groups/${groupId}/members`, payload);
  }

  removeGroupMember(groupId: string, payload: { username: string; requester: string }) {
    return this.http.request('delete', `${this.base}/groups/${groupId}/members`, { body: payload });
  }

  getGroups() {
    return this.http.get<{ groups: any[] }>(`${this.base}/groups`);
  }

  addGroup(payload: { name: string; ownerUsername: string }) {
    return this.http.post<{ group: any }>(`${this.base}/groups`, payload);
  }

  // Join requests
  /**
   * Convenience / public API for requesting a user be added to a group.
   */
  requestJoinGroup(groupId: string, payload: { username: string }) {
    return this.http.post<{ request: any }>(`${this.base}/groups/${groupId}/requests`, payload);
  }

  listJoinRequests(requester: string) {
    return this.http.get<{ requests: any[] }>(`${this.base}/requests?requester=${encodeURIComponent(requester)}`);
  }

  approveRequest(requestId: string, payload: { requester: string }) {
    return this.http.put<{ request: any }>(`${this.base}/requests/${requestId}/approve`, payload);
  }

  denyRequest(requestId: string, payload: { requester: string }) {
    return this.http.put<{ request: any }>(`${this.base}/requests/${requestId}/deny`, payload);
  }

  deleteGroup(groupId: string, payload?: { requester?: string }) {
    return this.http.request('delete', `${this.base}/groups/${groupId}`, { body: payload || {} });
  }

  /**
   * Deprecated: alias for addAdminToGroup. Kept for backwards compatibility.
   */
  promoteAdmin(groupId: string, payload: { username: string }) {
    return this.addAdminToGroup(groupId, payload as any);
  }

  addAdminToGroup(groupId: string, payload: { username: string; requester: string }) {
    return this.http.post(`${this.base}/groups/${groupId}/admins`, payload);
  }
  removeAdminFromGroup(groupId: string, payload: { username: string; requester: string }) {
    return this.http.request('delete', `${this.base}/groups/${groupId}/admins`, { body: payload });
  }
  changeUserRole(userId: string, role: string, payload?: { requester?: string }) {
    return this.http.put(`${this.base}/users/${userId}/role`, { role, ...(payload || {}) });
  }

  deleteUser(userId: string, payload?: { requester?: string }) {
    return this.http.request('delete', `${this.base}/users/${userId}`, { body: payload || {} });
  }

  // Update user profile (username/email/password). requester must be provided.
  updateUserProfile(userId: string, payload: { username?: string; email?: string; password?: string; requester: string }) {
    return this.http.put<{ user: any }>(`${this.base}/users/${userId}`, payload);
  }

  uploadAvatar(file: File, requester: string) {
    const fd = new FormData();
    fd.append('avatar', file);
    fd.append('requester', requester);
    return this.http.post<{ ok: boolean; user: any; avatarUrl: string }>(`${this.base}/uploads/avatar`, fd);
  }

  uploadMessageImage(file: File, payload: { username: string; groupId: string; channelId: string }) {
    const fd = new FormData();
    fd.append('image', file);
    fd.append('username', payload.username);
    fd.append('groupId', payload.groupId);
    fd.append('channelId', payload.channelId);
    return this.http.post<{ ok: boolean; url: string }>(`${this.base}/uploads/message-image`, fd);
  }

  // Paginated message history (older messages): pass beforeTs to page backwards
  getMessages(groupId: string, channelId: string, opts: { user: string; limit?: number; beforeTs?: number }) {
    const params = new URLSearchParams();
    params.set('user', opts.user);
    if (opts.limit) params.set('limit', String(opts.limit));
    if (opts.beforeTs) params.set('beforeTs', String(opts.beforeTs));
    return this.http.get<{ messages: any[]; hasMore?: boolean }>(`${this.base}/messages/${groupId}/${channelId}?${params.toString()}`);
  }
}
