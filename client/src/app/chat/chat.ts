import { Component, OnInit } from '@angular/core';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Api } from '../api.service';
import { Auth } from '../auth.service';
import { SocketService, ChatMessage } from '../socket.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, NgIf, NgForOf, RouterModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class Chat implements OnInit {
  groups: any[] = [];
  selectedGroupId = '';
  selectedChannelId = '';

  // Placeholder messages until Socket.IO + API history is added
  messages: Array<{ id: string; username: string; text: string; ts: number }> = [];
  messageText = '';
  statusMsg = '';
  errorMsg = '';

  constructor(private api: Api, private auth: Auth, private sockets: SocketService) {}

  ngOnInit(): void {
    // connect socket once
    this.sockets.connect();
    this.sockets.messages().subscribe((m: ChatMessage) => {
      // Only append if it matches current selection
      if (m.groupId === this.selectedGroupId && m.channelId === this.selectedChannelId) {
        this.messages = [...this.messages, { id: m.id, username: m.username, text: m.text, ts: m.ts }];
        // Optional: simple auto-scroll could be added here if we had ViewChild of the container
      }
    });
    this.loadGroups();
  }

  loadGroups() {
    this.api.getGroups().subscribe({
      next: (res: any) => {
        this.groups = (res.groups || []).map((g: any) => ({ ...g }));
        const first = this.visibleGroups()[0];
        if (first) {
          this.selectGroup(first.id);
        } else {
          this.selectedGroupId = '';
          this.selectedChannelId = '';
        }
      },
      error: () => (this.groups = [])
    });
  }

  // Utility to compute displayable members (hide 'super')
  displayMembers(g: any) {
    return (g.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
  }

  username() { return this.auth.user()?.username ?? ''; }
  isSuper() { return (this.auth.user()?.roles || []).includes('Super Admin'); }
  isMember(g: any) {
    if (!g) return false;
    const me = (this.username() || '').toLowerCase();
    return (g.members || []).map((m: string) => (m || '').toLowerCase()).includes(me);
  }

  visibleGroups() {
    if (this.isSuper()) return this.groups || [];
    return (this.groups || []).filter(g => this.isMember(g));
  }

  get selectedGroup() {
    return (this.groups || []).find((g: any) => g.id === this.selectedGroupId);
  }
  get selectedChannel() {
    const g = this.selectedGroup as any;
    if (!g) return null;
    return (g.channels || []).find((c: any) => c.id === this.selectedChannelId) || null;
  }

  channelsFor(groupId: string) {
    const g = (this.groups || []).find((x: any) => x.id === groupId);
    return g ? (g.channels || []) : [];
  }

  selectGroup(groupId: string) {
    this.selectedGroupId = groupId;
    const channels = this.channelsFor(groupId);
    this.selectedChannelId = channels.length ? channels[0].id : '';
    // Reset placeholder messages when switching
    this.messages = [];
    const username = this.username();
    if (username && this.selectedGroupId && this.selectedChannelId) {
      this.joinCurrent(username);
    }
  }

  selectChannel(channelId: string) {
    this.selectedChannelId = channelId;
    // Reset placeholder messages when switching
    this.messages = [];
    const username = this.username();
    if (username && this.selectedGroupId && this.selectedChannelId) {
      this.joinCurrent(username);
    }
  }

  selectChannelOfGroup(groupId: string, channelId: string) {
    // Helper for sidebar click: ensure group selection is synced
    if (this.selectedGroupId !== groupId) {
      this.selectedGroupId = groupId;
    }
    this.selectChannel(channelId);
  }

  private async joinCurrent(username: string) {
    this.errorMsg = '';
    this.statusMsg = '';
    const ack = await this.sockets.join(username, this.selectedGroupId, this.selectedChannelId);
    if (!ack?.ok) {
      this.errorMsg = ack?.error || 'Failed to join room';
    } else {
      const g = this.selectedGroup as any;
      const c = this.selectedChannel as any;
      this.statusMsg = `Joined ${g?.name || this.selectedGroupId} / #${c?.name || this.selectedChannelId}`;
      if (Array.isArray(ack.history)) {
        // Replace messages array with persisted history
        this.messages = ack.history.map(h => ({ id: h.id, username: h.username, text: h.text, ts: h.ts }));
      }
    }
  }

  async onSend() {
    const text = (this.messageText || '').trim();
    if (!text || !this.selectedGroupId || !this.selectedChannelId) return;
    // Send via socket; rely on server echo to append
    this.errorMsg = '';
    const ack = await this.sockets.send(text);
    if (!ack?.ok) {
      this.errorMsg = ack?.error || 'Failed to send message';
    }
    this.messageText = '';
  }
}
