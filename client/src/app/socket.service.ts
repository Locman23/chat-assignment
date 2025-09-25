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

  join(username: string, groupId: string, channelId: string): Promise<{ ok: boolean; error?: string }> {
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
}
