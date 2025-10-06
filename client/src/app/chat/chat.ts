import { Component, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
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
export class Chat implements OnInit, AfterViewInit {
  groups: any[] = [];
  selectedGroupId = '';
  selectedChannelId = '';

  // Placeholder messages until Socket.IO + API history is added
  messages: Array<{ id: string; username: string; text: string; ts: number }> = [];
  messageText = '';
  statusMsg = '';
  errorMsg = '';
  presenceUsers: string[] = [];
  typingUsers: string[] = [];
  roster: Array<{ username: string; status: string }> = [];
  private typing = false;
  private typingTimer: any;
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;
  private atBottom = true; // tracks if user is near the bottom (eligible for auto-scroll)
  private historyLoaded = false;
  hasMore = true; // assume there may be older messages until proven otherwise
  loadingOlder = false;

  constructor(private api: Api, private auth: Auth, private sockets: SocketService) {}

  ngOnInit(): void {
    // connect socket once
    this.sockets.connect();
    this.sockets.messages().subscribe((m: ChatMessage) => {
      if (m.groupId === this.selectedGroupId && m.channelId === this.selectedChannelId) {
        const shouldScroll = this.atBottom; // capture before DOM changes
        this.messages = [...this.messages, { id: m.id, username: m.username, text: m.text, ts: m.ts }];
        if (shouldScroll) this.deferScrollToBottom();
      }
    });
    this.sockets.presence().subscribe(users => {
      this.presenceUsers = users;
    });
    this.sockets.typing().subscribe(users => {
      // Exclude self when storing; easier for display logic
      const me = this.username().toLowerCase();
      this.typingUsers = users.filter(u => u.toLowerCase() !== me);
    });
    this.sockets.roster().subscribe(r => {
      this.roster = r.slice().sort((a,b) => {
        const order = (s: string) => s === 'active' ? 0 : s === 'online' ? 1 : 2;
        const diff = order(a.status) - order(b.status);
        return diff !== 0 ? diff : a.username.localeCompare(b.username);
      });
    });
    this.loadGroups();
  }

  ngAfterViewInit(): void {
    // In case history arrived before view init
    this.deferScrollToBottom();
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
        this.historyLoaded = true;
        // Always scroll on initial history load for a room
        this.deferScrollToBottom();
        // After initial load we cannot know if more exist; defer until user presses load older
        // Basic heuristic: if we received fewer than 50 messages, assume no more
        this.hasMore = this.messages.length >= 50; // 50 is the server default
      }
      // Request roster explicitly (in addition to push) as a safety net
      this.sockets.requestRoster().then(ack => {
        if (ack?.ok && Array.isArray(ack.roster)) {
          // eslint-disable-next-line no-console
          console.log('[chat] roster ack', ack.roster);
          this.roster = ack.roster.slice().sort((a,b) => {
            const order = (s: string) => s === 'active' ? 0 : s === 'online' ? 1 : 2;
            const diff = order(a.status) - order(b.status);
            return diff !== 0 ? diff : a.username.localeCompare(b.username);
          });
        } else {
          // eslint-disable-next-line no-console
          console.warn('[chat] roster ack failed', ack);
        }
      });
    }
  }

  get oldestTimestamp() {
    if (!this.messages.length) return undefined;
    return this.messages[0].ts;
  }

  canLoadOlder() {
    return this.selectedGroupId && this.selectedChannelId && this.hasMore && !this.loadingOlder && !!this.messages.length;
  }

  loadOlder() {
    if (!this.canLoadOlder()) return;
    const beforeTs = this.oldestTimestamp;
    if (!beforeTs) return;
    this.loadingOlder = true;
    const prevScrollEl = this.scrollContainer?.nativeElement;
    const prevHeight = prevScrollEl ? prevScrollEl.scrollHeight : 0;
    const username = this.username();
    this.api.getMessages(this.selectedGroupId, this.selectedChannelId, { user: username, limit: 50, beforeTs }).subscribe({
      next: (res) => {
        const incoming = (res.messages || []).filter(m => !this.messages.some(ex => ex.id === m.id));
        // Prepend older messages
        this.messages = [...incoming.map(m => ({ id: m.id, username: m.username, text: m.text, ts: m.ts })), ...this.messages];
        // Use server's hasMore directly (accurate via limit+1 strategy); if no new messages, hasMore false
        this.hasMore = !!res.hasMore;
        // Preserve scroll position after prepending
        queueMicrotask(() => {
          if (prevScrollEl) {
            const newHeight = prevScrollEl.scrollHeight;
            prevScrollEl.scrollTop = newHeight - prevHeight; // anchor to first previously visible message
          }
        });
      },
      error: () => {
        this.hasMore = false; // disable to avoid spam; could retry
      },
      complete: () => { this.loadingOlder = false; }
    });
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
    // Ensure typing indicator cleared after send
    this.stopTyping();
    // If user just sent a message, keep them at bottom
    this.deferScrollToBottom();
  }

  onInputChange() {
    if (!this.typing) {
      this.typing = true;
      this.sockets.setTyping(true);
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
    // Inactivity threshold to stop typing
    this.typingTimer = setTimeout(() => this.stopTyping(), 2000);
  }

  private stopTyping() {
    if (!this.typing) return;
    this.typing = false;
    this.sockets.setTyping(false);
    if (this.typingTimer) {
      clearTimeout(this.typingTimer);
      this.typingTimer = undefined;
    }
  }

  typingDisplay() {
    if (!this.typingUsers.length) return '';
    if (this.typingUsers.length === 1) return `${this.typingUsers[0]} is typing...`;
    if (this.typingUsers.length === 2) return `${this.typingUsers[0]} and ${this.typingUsers[1]} are typing...`;
    return `${this.typingUsers.slice(0, 2).join(', ')} and ${this.typingUsers.length - 2} others are typing...`;
  }

  private deferScrollToBottom() {
    // allow Angular change detection to render messages first
    queueMicrotask(() => this.scrollToBottom());
  }

  private scrollToBottom() {
    try {
      const el = this.scrollContainer?.nativeElement;
      if (!el) return;
      el.scrollTop = el.scrollHeight;
      this.atBottom = true;
    } catch {
      // ignore
    }
  }

  onScroll() {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
    const threshold = 56; // px tolerance from bottom
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    this.atBottom = distanceFromBottom <= threshold;
  }
}
