import { Component, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Api } from '../api.service';
import { Auth } from '../auth.service';
import { SocketService, ChatMessage } from '../socket.service';
import { absoluteUrl } from '../config';
import { HISTORY_PAGE_SIZE, SCROLL_BOTTOM_THRESHOLD_PX, TYPING_INACTIVITY_MS, FALLBACK_AVATAR_COLORS } from '../constants';

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

  // Chat messages currently loaded in view
  messages: Array<{ id: string; username: string; text: string; ts: number; attachments?: Array<{ type: string; url: string }>; avatarUrl?: string }> = [];
  messageText = '';
  statusMsg = '';
  errorMsg = '';
  presenceUsers: string[] = [];
  typingUsers: string[] = [];
  roster: Array<{ username: string; status: string; avatarUrl?: string }> = [];
  private typing = false;
  private typingTimer: any;
  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;
  private atBottom = true; // tracks if user is near the bottom (eligible for auto-scroll)
  private historyLoaded = false;
  hasMore = true; // assume there may be older messages until proven otherwise
  loadingOlder = false;
  private rosterMap = new Map<string, string | undefined>();

  constructor(private api: Api, private auth: Auth, private sockets: SocketService) {}

  ngOnInit(): void {
  // One-time socket connection
    this.sockets.connect();
    this.sockets.messages().subscribe((m: ChatMessage) => {
      if (m.groupId === this.selectedGroupId && m.channelId === this.selectedChannelId) {
  const shouldScroll = this.atBottom;
        const built = this.buildMessage(m);
        this.messages = [...this.messages, built];
  // Backfill roster avatar if newly discovered via message
        if (built.avatarUrl && built.username !== 'system') {
          const key = built.username.toLowerCase();
            const existing = this.rosterMap.get(key);
            if (!existing) {
              this.rosterMap.set(key, built.avatarUrl);
              let changed = false;
              this.roster = this.roster.map(u => {
                if (u.username.toLowerCase() === key && !u.avatarUrl) { changed = true; return { ...u, avatarUrl: built.avatarUrl }; }
                return u;
              });
              if (changed && shouldScroll) this.deferScrollToBottom();
            }
        }
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
    this.sockets.roster().subscribe((r: any[]) => {
  // Merge roster, preserving any previously learned avatars
      const previous = new Map(this.rosterMap);
      for (const m of this.messages) if (m.avatarUrl) this.rosterMap.set(m.username.toLowerCase(), m.avatarUrl);
      const transformed = r.map(u => {
        const key = String(u.username).toLowerCase();
        const incoming = this.absUrl(u.avatarUrl);
        const existing = this.rosterMap.get(key) || previous.get(key);
        const avatarUrl = incoming || existing;
        if (avatarUrl) this.rosterMap.set(key, avatarUrl);
        return { ...u, avatarUrl };
      });
      this.roster = transformed.sort((a:any,b:any) => {
        const order = (s: string) => s === 'active' ? 0 : s === 'online' ? 1 : 2;
        const diff = order(a.status) - order(b.status);
        return diff !== 0 ? diff : a.username.localeCompare(b.username);
      });
      let changed = false;
      this.messages = this.messages.map(m => {
        if (!m.avatarUrl && m.username !== 'system') {
          const av = this.rosterMap.get(m.username.toLowerCase());
          if (av) { changed = true; return { ...m, avatarUrl: av }; }
        }
        return m;
      });
      if (changed && this.atBottom) this.deferScrollToBottom();
    });
    this.loadGroups();
  }

  ngAfterViewInit(): void {
  // Scroll to bottom if history arrived before view init
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
  // Clear messages when switching groups
    this.messages = [];
    const username = this.username();
    if (username && this.selectedGroupId && this.selectedChannelId) {
      this.joinCurrent(username);
    }
  }

  selectChannel(channelId: string) {
    this.selectedChannelId = channelId;
  // Clear messages when switching channels
    this.messages = [];
    const username = this.username();
    if (username && this.selectedGroupId && this.selectedChannelId) {
      this.joinCurrent(username);
    }
  }

  selectChannelOfGroup(groupId: string, channelId: string) {
  // Sidebar click: ensure group selection is in sync
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
  // Replace with initial history
        this.messages = ack.history.map(h => this.buildMessage(h));
        this.historyLoaded = true;
  // Scroll on initial load
        this.deferScrollToBottom();
  // Heuristic: fewer than a full page => likely no more
  this.hasMore = this.messages.length >= HISTORY_PAGE_SIZE; // page size heuristic
      }
      const ackAny: any = ack;
      if (Array.isArray(ackAny.roster)) {
  // Use enriched roster; keep existing avatar mappings
        this.roster = ackAny.roster.slice().map((x:any)=> {
          const av = this.absUrl(x.avatarUrl);
          if (av) this.rosterMap.set(String(x.username).toLowerCase(), av);
          return { ...x, avatarUrl: av };
        }).sort((a:any,b:any) => {
          const order = (s: string) => s === 'active' ? 0 : s === 'online' ? 1 : 2;
          const diff = order(a.status) - order(b.status);
          return diff !== 0 ? diff : a.username.localeCompare(b.username);
        });
        // Enrich any history messages missing avatar now that roster is known
        this.messages = this.messages.map(m => !m.avatarUrl && m.username !== 'system' ? { ...m, avatarUrl: this.rosterMap.get(m.username.toLowerCase()) } : m);
      }
      // Only request roster if server did not send one in join ack (saves an overwrite that could drop avatars)
      if (!Array.isArray((ack as any).roster)) {
        this.sockets.requestRoster().then(ack => {
        if (ack?.ok && Array.isArray(ack.roster)) {
          // eslint-disable-next-line no-console
          console.log('[chat] roster ack', ack.roster);
          // Merge roster; retain existing avatars
          const merged = ack.roster.slice().map((x:any) => {
            const key = String(x.username).toLowerCase();
            const incoming = this.absUrl(x.avatarUrl);
            const existing = this.rosterMap.get(key);
            const avatarUrl = incoming || existing; // preserve existing if incoming missing
            if (avatarUrl) this.rosterMap.set(key, avatarUrl);
            return { ...x, avatarUrl };
          }).sort((a:any,b:any) => {
            const order = (s: string) => s === 'active' ? 0 : s === 'online' ? 1 : 2;
            const diff = order(a.status) - order(b.status);
            return diff !== 0 ? diff : a.username.localeCompare(b.username);
          });
          this.roster = merged;
          // Enrich messages still missing avatars
          this.messages = this.messages.map(m => !m.avatarUrl && m.username !== 'system' ? { ...m, avatarUrl: this.rosterMap.get(m.username.toLowerCase()) } : m);
        } else {
          // eslint-disable-next-line no-console
          console.warn('[chat] roster ack failed', ack);
        }
        });
      }
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
  this.api.getMessages(this.selectedGroupId, this.selectedChannelId, { user: username, limit: HISTORY_PAGE_SIZE, beforeTs }).subscribe({
      next: (res) => {
  const incoming = (res.messages || []).filter(m => !this.messages.some(ex => ex.id === m.id));
  // Prepend older messages (pagination backward)
        const mapped = incoming.map(m => this.buildMessage(m));
        this.messages = [...mapped, ...this.messages];
  // Accurate hasMore from server (limit+1 strategy)
        this.hasMore = !!res.hasMore;
  // Preserve scroll anchor after prepend
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
  // Emit via socket; rely on echo to append
    this.errorMsg = '';
    const ack = await this.sockets.send(text);
    if (!ack?.ok) {
      this.errorMsg = ack?.error || 'Failed to send message';
    }
    this.messageText = '';
  // Clear typing indicator after send
    this.stopTyping();
  // Keep scroll pinned after send
    this.deferScrollToBottom();
  }

  async onSelectImage(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;
    const file = input.files[0];
  // Client-side image type validation
    if (!file.type.startsWith('image/')) { this.errorMsg = 'Invalid image type'; return; }
    const username = this.username();
    if (!username) { this.errorMsg = 'Not authenticated'; return; }
    try {
      const res: any = await this.api.uploadMessageImage(file, { username, groupId: this.selectedGroupId, channelId: this.selectedChannelId }).toPromise();
      if (res?.ok && res.url) {
  // Send message with image attachment (text optional)
        const ack = await this.sockets.send(this.messageText.trim(), { imageUrl: res.url });
        if (!ack?.ok) this.errorMsg = ack?.error || 'Failed to send image';
        this.messageText = '';
        this.stopTyping();
      } else {
        this.errorMsg = 'Upload failed';
      }
    } catch (e: any) {
      this.errorMsg = e?.error?.error || 'Upload failed';
    } finally {
      input.value = '';
    }
  }

  onInputChange() {
    if (!this.typing) {
      this.typing = true;
      this.sockets.setTyping(true);
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
  // Typing inactivity timeout
  this.typingTimer = setTimeout(() => this.stopTyping(), TYPING_INACTIVITY_MS);
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
  // Wait a tick so DOM reflects new messages
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

  private withAbsolute(att?: Array<{ type: string; url: string }>) {
    if (!att) return att;
    return att.map(a => ({ ...a, url: this.absUrl(a.url) || a.url }));
  }

  private absUrl(url?: string) {
    if (!url) return undefined;
  if (/^https?:\/\//i.test(url)) return url; // already absolute
  return absoluteUrl(url);
  }

  private buildMessage(raw: any) {
    const atts = this.withAbsolute(raw.attachments);
    let avatar = this.absUrl(raw.avatarUrl);
    if (!avatar && raw.username && raw.username !== 'system') {
      avatar = this.rosterMap.get(String(raw.username).toLowerCase());
    }
    return { id: raw.id, username: raw.username, text: raw.text, ts: raw.ts, attachments: atts, avatarUrl: avatar };
  }

  // Placeholder avatar helpers
  initial(name: string) {
    if (!name) return '?';
    const trimmed = name.trim();
    if (!trimmed) return '?';
    return trimmed.charAt(0).toUpperCase();
  }

  private colorCache = new Map<string,string>();
  private palette = [
    '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9', '#14B8A6',
    '#F43F5E', '#6D28D9', '#DD6B20', '#059669', '#2563EB'
  ];
  colorFor(name: string) {
    if (!name) return '#888';
    const key = name.toLowerCase();
    const existing = this.colorCache.get(key);
    if (existing) return existing;
    // Simple DJB2 hash
    let h = 5381;
    for (let i=0;i<key.length;i++) h = ((h << 5) + h) + key.charCodeAt(i);
    const color = this.palette[Math.abs(h) % this.palette.length];
    this.colorCache.set(key, color);
    return color;
  }

  onScroll() {
    const el = this.scrollContainer?.nativeElement;
    if (!el) return;
  const threshold = SCROLL_BOTTOM_THRESHOLD_PX; // px tolerance from bottom
    const distanceFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    this.atBottom = distanceFromBottom <= threshold;
  }
}
