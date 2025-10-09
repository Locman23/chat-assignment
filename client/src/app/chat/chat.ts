import { Component, OnInit, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule, NgIf, NgForOf } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

import { Api } from '../api.service';
import { Auth } from '../auth.service';
import { SocketService, ChatMessage } from '../socket.service';
import { absoluteUrl } from '../config';
import { HISTORY_PAGE_SIZE, SCROLL_BOTTOM_THRESHOLD_PX, TYPING_INACTIVITY_MS } from '../constants';

/**
 * Chat component
 * --------------------------------------------------
 * Responsible for:
 *  - Listing groups / channels the current user can access
 *  - Joining a (group, channel) room over Socket.IO
 *  - Rendering message history with backward pagination
 *  - Streaming real-time messages / presence / typing events
 *  - Handling image attachments and avatar enrichment
 *  - Managing scroll anchoring & auto-scroll behavior
 *
 * This file intentionally keeps no global store; state lives here and is
 * replaced on each room switch to avoid stale cross-room data leaks.
 */

// Magic value centralisation for clarity & future refactor
const SYSTEM_USERNAME = 'system';

// ---------------------------------------------------------------------------
// Internal (module-scoped) interfaces (kept un-exported intentionally)
// ---------------------------------------------------------------------------
interface ChatAttachment { type: string; url: string; }
interface DisplayedMessage { id: string; username: string; text?: string; ts: number; attachments?: ChatAttachment[]; avatarUrl?: string; }
interface RosterEntry { username: string; status: string; avatarUrl?: string }
interface ChatChannel { id: string; name: string }
interface ChatGroup { id: string; name: string; ownerUsername?: string; members?: string[]; channels?: ChatChannel[] }

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, NgIf, NgForOf, RouterModule, FormsModule],
  templateUrl: './chat.html',
  styleUrls: ['./chat.scss']
})
export class Chat implements OnInit, AfterViewInit, OnDestroy {
  // -------------------------------------------------------------------------
  // Static helpers / constants
  // -------------------------------------------------------------------------
  private static readonly AVATAR_ORDER = (status: string) =>
    status === 'active' ? 0 : (status === 'online' ? 1 : 2);
  // Fixed color palette for deterministic user placeholders (simple hashing)
  private palette: string[] = [
    '#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#0EA5E9',
    '#14B8A6', '#F43F5E', '#6D28D9', '#DD6B20', '#059669', '#2563EB'
  ];

  // -------------------------------------------------------------------------
  // Component state
  // -------------------------------------------------------------------------
  groups: ChatGroup[] = [];
  selectedGroupId = '';
  selectedChannelId = '';
  messages: DisplayedMessage[] = [];
  messageText = '';
  statusMsg = '';
  errorMsg = '';
  presenceUsers: string[] = [];
  typingUsers: string[] = [];
  roster: RosterEntry[] = [];
  hasMore = false; // becomes true if server indicates older history likely exists
  loadingOlder = false;

  // -------------------------------------------------------------------------
  // Internal runtime fields (non-UI state)
  // -------------------------------------------------------------------------
  private typing = false;
  private typingTimer?: any; // using any due to browser timer typing differences
  private atBottom = true;
  private rosterMap = new Map<string, string | undefined>(); // lower(username) -> avatarUrl
  private subs: { unsubscribe(): void }[] = [];

  @ViewChild('scrollContainer') private scrollContainer?: ElementRef<HTMLDivElement>;

  constructor(private api: Api, private auth: Auth, private sockets: SocketService) {}

  ngOnInit(): void {
    // Connect sockets once
    this.sockets.connect();

    // Messages
    this.subs.push(this.sockets.messages().subscribe((m: ChatMessage) => this.onIncomingMessage(m)));
    // Presence
    this.subs.push(this.sockets.presence().subscribe(users => { this.presenceUsers = users; }));
    // Typing
    this.subs.push(this.sockets.typing().subscribe(users => this.applyTyping(users)));
    // Roster
    this.subs.push(this.sockets.roster().subscribe(r => this.applyRoster(r)));

    // Initial data
    this.loadGroups();
  }

  ngAfterViewInit(): void {
    this.deferScrollToBottom();
  }

  ngOnDestroy(): void {
    for (const s of this.subs) {
      try { s.unsubscribe(); } catch { /* ignore */ }
    }
    if (this.typingTimer) clearTimeout(this.typingTimer);
  }

  /**
   * Fetch all groups; auto-select the first visible one for the current user.
   */
  loadGroups() {
    this.api.getGroups().subscribe({
      next: (res: any) => {
        this.groups = (res.groups || []).map((g: ChatGroup) => ({ ...g }));
        const firstVisible = this.visibleGroups()[0];
        if (firstVisible) this.selectGroup(firstVisible.id); else this.resetSelection();
      },
      error: () => { this.groups = []; this.resetSelection(); }
    });
  }

  private resetSelection() {
    this.selectedGroupId = '';
    this.selectedChannelId = '';
    this.messages = [];
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

  /** Visible groups (Super sees all; regular user sees memberships). */
  visibleGroups() {
    return this.isSuper() ? (this.groups || []) : (this.groups || []).filter(g => this.isMember(g));
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

  /** Select a group (auto-select first channel & join). */
  selectGroup(groupId: string) {
    if (this.selectedGroupId === groupId) return;
    this.selectedGroupId = groupId;
    const channels = this.channelsFor(groupId);
    this.selectedChannelId = channels[0]?.id || '';
    this.resetMessagesAndJoin();
  }

  /** Select channel in current group and re-join. */
  selectChannel(channelId: string) {
    if (this.selectedChannelId === channelId) return;
    this.selectedChannelId = channelId;
    this.resetMessagesAndJoin();
  }

  selectChannelOfGroup(groupId: string, channelId: string) {
    if (this.selectedGroupId !== groupId) this.selectedGroupId = groupId;
    this.selectChannel(channelId);
  }

  private resetMessagesAndJoin() {
    this.messages = [];
    const user = this.username();
    if (user && this.selectedGroupId && this.selectedChannelId) this.joinCurrent(user);
  }

  /**
   * Join the active (group, channel) room over sockets and hydrate initial
   * history + roster. Falls back to requesting roster if not shipped in ack.
   */
  private async joinCurrent(username: string) {
    this.errorMsg = '';
    this.statusMsg = '';
    const ack = await this.sockets.join(username, this.selectedGroupId, this.selectedChannelId);
    if (!ack?.ok) { this.errorMsg = ack?.error || 'Failed to join room'; return; }

    const groupName = this.selectedGroup?.name || this.selectedGroupId;
    const channelName = this.selectedChannel?.name || this.selectedChannelId;
    this.statusMsg = `Joined ${groupName} / #${channelName}`;

    if (Array.isArray(ack.history)) {
      this.messages = ack.history.map(h => this.buildMessage(h)); // newest at end
      this.deferScrollToBottom();
      // Heuristic: if we received a full page, assume older exists
      this.hasMore = this.messages.length === HISTORY_PAGE_SIZE;
    }

    if (Array.isArray((ack as any).roster)) this.applyRoster((ack as any).roster);
    else this.sockets.requestRoster().then(rack => { if (rack?.ok && Array.isArray(rack.roster)) this.applyRoster(rack.roster); });
  }

  /** Oldest (top) message timestamp for pagination anchor. */
  get oldestTimestamp() {
    if (!this.messages.length) return undefined;
    return this.messages[0].ts;
  }

  /** Whether older history can be paged (UI gate). */
  canLoadOlder() {
    return this.selectedGroupId && this.selectedChannelId && this.hasMore && !this.loadingOlder && !!this.messages.length;
  }

  /**
   * Retrieve older messages before current oldest timestamp and prepend while
   * preserving scroll position so the previously first visible message remains.
   */
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

  /** Send a text message (ignores pure whitespace). */
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
    this.stopTyping();
    this.deferScrollToBottom();
  }

  /** Handle image selection -> upload -> emit message linking uploaded file. */
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
        // Send message with image attachment
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

  /** Track typing state transitions with inactivity timeout. */
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

  /** Human friendly typing indicator text. */
  typingDisplay() {
    if (!this.typingUsers.length) return '';
    if (this.typingUsers.length === 1) return `${this.typingUsers[0]} is typing...`;
    if (this.typingUsers.length === 2) return `${this.typingUsers[0]} and ${this.typingUsers[1]} are typing...`;
    return `${this.typingUsers.slice(0, 2).join(', ')} and ${this.typingUsers.length - 2} others are typing...`;
  }

  private deferScrollToBottom() {
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

  private withAbsolute(att?: ChatAttachment[]) {
    if (!att) return att;
    return att.map(a => ({ ...a, url: this.absUrl(a.url) || a.url }));
  }

  private absUrl(url?: string) {
    if (!url) return undefined;
    if (/^https?:\/\//i.test(url)) return url; // already absolute
    return absoluteUrl(url);
  }

  /** Convert raw socket/api message into view model (resolving avatars). */
  private buildMessage(raw: any): DisplayedMessage {
    const atts = this.withAbsolute(raw.attachments);
    let avatar = this.absUrl(raw.avatarUrl);
    if (!avatar && raw.username && raw.username !== SYSTEM_USERNAME) {
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

  private colorCache = new Map<string, string>();
  colorFor(name: string) {
    if (!name) return '#888';
    const key = name.toLowerCase();
    const existing = this.colorCache.get(key);
    if (existing) return existing;
    // Simple DJB2 hash
    let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h) + key.charCodeAt(i);
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

  // --- Event / State Helpers -------------------------------------------------
  /** Handle new incoming real-time message (only if for active room). */
  private onIncomingMessage(m: ChatMessage) {
    if (m.groupId !== this.selectedGroupId || m.channelId !== this.selectedChannelId) return;
    const shouldScroll = this.atBottom;
    const built = this.buildMessage(m);
    this.messages = [...this.messages, built];
    if (built.avatarUrl && built.username !== SYSTEM_USERNAME) {
      this.ensureAvatarCache(built.username, built.avatarUrl, shouldScroll);
    }
    if (shouldScroll) this.deferScrollToBottom();
  }

  private ensureAvatarCache(username: string, avatarUrl: string | undefined, triggerScroll: boolean) {
    if (!avatarUrl) return;
    const key = username.toLowerCase();
    if (this.rosterMap.has(key)) return;
    this.rosterMap.set(key, avatarUrl);
    let changed = false;
    this.roster = this.roster.map(r => {
      if (r.username.toLowerCase() === key && !r.avatarUrl) { changed = true; return { ...r, avatarUrl }; }
      return r;
    });
    if (changed && triggerScroll) this.deferScrollToBottom();
  }

  private applyTyping(users: string[]) {
    const me = this.username().toLowerCase();
    this.typingUsers = users.filter(u => u.toLowerCase() !== me);
  }

  /** Merge roster snapshot, enriching messages missing avatar URLs. */
  private applyRoster(r: any[]) {
    if (!Array.isArray(r)) return;
    // Pre-cache avatars from existing messages
    for (const m of this.messages) {
      if (m.avatarUrl) this.rosterMap.set(m.username.toLowerCase(), m.avatarUrl);
    }
    const enriched = r.map(u => {
      const key = String(u.username).toLowerCase();
      const incoming = this.absUrl(u.avatarUrl);
      const existing = this.rosterMap.get(key);
      const avatarUrl = incoming || existing;
      if (avatarUrl) this.rosterMap.set(key, avatarUrl);
      return { ...u, avatarUrl };
    }).sort((a, b) => {
      const diff = Chat.AVATAR_ORDER(a.status) - Chat.AVATAR_ORDER(b.status);
      return diff !== 0 ? diff : a.username.localeCompare(b.username);
    });
    this.roster = enriched;
    // Fill any messages missing avatars now that we know more
    let mutated = false;
    this.messages = this.messages.map(m => {
      if (!m.avatarUrl && m.username !== SYSTEM_USERNAME) {
        const av = this.rosterMap.get(m.username.toLowerCase());
        if (av) {
          mutated = true;
          return { ...m, avatarUrl: av };
        }
      }
      return m;
    });
    if (mutated && this.atBottom) this.deferScrollToBottom();
  }
}
