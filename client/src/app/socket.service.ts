import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { Observable, Subject } from 'rxjs';

export interface ChatMessage {
  id: string;
  username: string;
  groupId: string;
  channelId: string;
  text: string;
  ts: number;
}

@Injectable({ providedIn: 'root' })
export class SocketService {
  private socket?: Socket;
  private message$ = new Subject<ChatMessage>();
  private presence$ = new Subject<string[]>();
  private typing$ = new Subject<string[]>();

  connect(url = 'http://localhost:3000') {
    if (this.socket) return;
  this.socket = io(url, { autoConnect: true });
    this.socket.on('connect', () => {
      // eslint-disable-next-line no-console
      console.log('[socket] connected', this.socket?.id);
    });
    this.socket.on('connect_error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[socket] connect_error', err);
    });
    this.socket.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[socket] error', err);
    });
    this.socket.on('chat:message', (m: ChatMessage) => this.message$.next(m));
    this.socket.on('chat:presence', (payload: { users: string[] }) => {
      this.presence$.next((payload?.users || []).slice());
    });
    this.socket.on('chat:typing', (payload: { users: string[] }) => {
      this.typing$.next((payload?.users || []).slice());
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
    }
  }

  messages(): Observable<ChatMessage> {
    return this.message$.asObservable();
  }

  presence(): Observable<string[]> {
    return this.presence$.asObservable();
  }

  typing(): Observable<string[]> {
    return this.typing$.asObservable();
  }

  join(username: string, groupId: string, channelId: string): Promise<{ ok: boolean; error?: string; history?: ChatMessage[] }> {
    return new Promise((resolve) => {
      this.socket?.emit('chat:join', { username, groupId, channelId }, (ack: any) => {
        // eslint-disable-next-line no-console
        console.log('[socket] join ack', ack);
        resolve(ack);
      });
    });
  }

  leave(): Promise<{ ok: boolean; error?: string }> {
    return new Promise((resolve) => {
      this.socket?.emit('chat:leave', {}, (ack: any) => resolve(ack));
    });
  }

  send(text: string): Promise<{ ok: boolean; error?: string; message?: ChatMessage }> {
    return new Promise((resolve) => {
      this.socket?.emit('chat:message', { text }, (ack: any) => {
        // eslint-disable-next-line no-console
        console.log('[socket] send ack', ack);
        resolve(ack);
      });
    });
  }

  setTyping(isTyping: boolean) {
    // Fire and forget; no need to await ack for UI responsiveness
    this.socket?.emit('chat:typing', { isTyping });
  }
}
