import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Auth } from '../auth.service';
import { Api } from '../api.service';
import { ChangeDetectorRef } from '@angular/core';
import { UserFilterPipe } from './user-filter.pipe';
import { GroupFilterPipe } from './group-filter.pipe';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, UserFilterPipe, GroupFilterPipe],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.scss']
})
export class Dashboard implements OnInit {
  // --- Users ---
  userSearch = '';
  userActionError = '';
  userActionSuccess = '';

  newUser: { username: string; email: string; password: string } = { username: '', email: '', password: '' };
  addUserError = '';
  addUserSuccess = false;
  users: any[] = [];

  // --- Groups ---
  groupSearch = '';
  groupActionError = '';
  groupActionSuccess = '';

  groups: any[] = [];
  selectedGroupId = '';
  // Join requests (for super admin)
  joinRequests: any[] = [];

  newGroup: { name: string; ownerUsername: string } = { name: '', ownerUsername: '' };
  addGroupError = '';
  addGroupSuccess = false;

  constructor(private auth: Auth, private router: Router, private api: Api, private cdr: ChangeDetectorRef) {}
  username = computed(() => this.auth.user()?.username ?? '');
  isSuper = () => this.auth.hasRole('Super Admin');

  // Helpers
  getUserByUsername(username: string) {
    return this.users.find(u => (u.username || '').toLowerCase() === (username || '').toLowerCase());
  }

  // Can the current user create a group?
  canCreateGroup() {
    return this.isSuper() || this.auth.hasRole('Group Admin');
  }

  // Can current user administer the specific group (owner, group admin for that group, or super)
  canAdminGroup(group: any) {
    const me = this.username();
    if (this.isSuper()) return true;
    if (!group) return false;
    if ((group.ownerUsername || '').toLowerCase() === (me || '').toLowerCase()) return true;
    if (group.admins && group.admins.some((a: string) => (a || '').toLowerCase() === (me || '').toLowerCase())) return true;
    return false;
  }

  // Is current user a member of the group?
  isMember(group: any) {
    const me = (this.username() || '').toLowerCase();
    if (!group || !group.members) return false;
    return (group.members || []).map((m: string) => (m || '').toLowerCase()).includes(me);
  }

  // Helper to get a group's name by id
  getGroupNameById(gid: string) {
    const g = (this.groups || []).find((x: any) => x.id === gid);
    return g ? g.name : '(unknown)';
  }

  isGroupOwner(group: any) {
    const me = this.username();
    return (group.ownerUsername || '').toLowerCase() === (me || '').toLowerCase();
  }

  // Is a specific user an admin of the group?
  isGroupAdmin(group: any, username: string) {
    if (!group || !group.admins) return false;
    return (group.admins || []).map((a: string) => (a || '').toLowerCase()).includes((username || '').toLowerCase());
  }

  // Toggle admin status: promote if not admin, remove if already admin
  /**
   * Toggle a user's admin membership for a group.
   * - If the user is currently an admin, attempts to remove them via API.
   * - If not an admin, calls promoteToGroupAdmin which performs an optimistic add.
   * Optimistic updates are applied locally and rolled back on API error.
   */
  toggleGroupAdmin(group: any, username: string) {
    this.groupActionError = '';
    this.groupActionSuccess = '';

    const isAdmin = this.isGroupAdmin(group, username);
    if (isAdmin) {
      // optimistic remove
      const prev = [...(group.admins || [])];
      group.admins = (group.admins || []).filter((a: any) => (a || '').toLowerCase() !== (username || '').toLowerCase());
      try { this.cdr.detectChanges(); } catch (e) {}

      this.api.removeAdminFromGroup(group.id, { username, requester: this.username() }).subscribe({
        next: () => {
          this.groupActionSuccess = 'Admin removed from group.';
        },
        error: (err: any) => {
          // rollback
          group.admins = prev;
          this.groupActionError = err?.error?.error || 'Failed to remove admin.';
          try { this.cdr.detectChanges(); } catch (e) {}
        }
      });
    } else {
      // reuse promote flow (optimistic add)
      this.promoteToGroupAdmin(group, username);
    }
  }

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  changeUserRole(user: any) {
    this.userActionError = '';
    this.userActionSuccess = '';
  this.api.changeUserRole(user.id, user.roles[0], { requester: this.username() }).subscribe({
      next: () => {
        this.userActionSuccess = 'Role updated!';
      },
      error: (err: any) => {
        this.userActionError = err?.error?.error || 'Failed to update role.';
      }
    });
  }

  editUser(user: any) {
    alert('Edit user feature coming soon!');
  }

  deleteUser(user: any) {
    if (!confirm(`Delete user ${user.username}?`)) return;
    this.userActionError = '';
    this.userActionSuccess = '';
  this.api.deleteUser(user.id, { requester: this.username() }).subscribe({
      next: () => {
        this.userActionSuccess = 'User deleted!';
        this.users = this.users.filter((u: any) => u.id !== user.id);
      },
      error: (err: any) => {
        this.userActionError = err?.error?.error || 'Failed to delete user.';
      }
    });
  }

  // Unified group management logic
  fetchGroups(): void {
    this.api.getGroups().subscribe({
      next: (res: any) => {
  this.groups = res.groups || [];

        // initialize helpers and fetch members/channels per group
        this.groups.forEach((group) => {
          group.newMember = '';
          group.newChannel = '';
          group.members = group.members || [];
          // prepare a display-only members list which removes the super user
          group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
          group.channels = group.channels || [];

          // fetch latest members
          this.api.getGroupMembers(group.id).subscribe({
            next: (r: any) => {
              group.members = r.members || [];
              group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
              // re-evaluate visibility after fresh members list
              this.applyGroupVisibilityFilter();
            },
            error: () => {
              group.members = group.members || [];
              group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
            }
          });

          // fetch latest channels
          this.api.getChannels(group.id).subscribe({
            next: (r: any) => (group.channels = r.channels || []),
            error: () => (group.channels = group.channels || [])
          });
        });

        // Apply visibility filter immediately (will re-run after member fetches)
        this.applyGroupVisibilityFilter();

        if (this.groups.length) this.selectedGroupId = this.groups[0].id;
      },
      error: () => {
        this.groups = [];
      }
    });
  }

  // Keep only groups visible to the current user unless Super Admin
  applyGroupVisibilityFilter() {
  // No-op: show all groups to authenticated users so they can request to join.
  // Former behaviour filtered out groups the user wasn't a member of; changed to
  // allow visibility of available groups and expose the Request-to-Join action.
  return;
  }

  // Request to join a group (called by regular users)
  /**
   * Create a join request for the current user to the supplied group.
   * The server stores requests persistently and Super Admin can approve/deny.
   */
  requestToJoin(group: any) {
    if (!this.username()) return;
    this.groupActionError = '';
    this.groupActionSuccess = '';
    this.api.requestJoinGroup(group.id, { username: this.username() }).subscribe({
      next: () => {
        this.groupActionSuccess = 'Join request sent to Super Admin.';
      },
      error: (err: any) => {
        this.groupActionError = err?.error?.error || 'Failed to send join request.';
      }
    });
  }

  // Super Admin: fetch pending join requests
  fetchJoinRequests() {
    if (!this.isSuper()) return;
    this.api.listJoinRequests(this.username()).subscribe({
      next: (res: any) => (this.joinRequests = res.requests || []),
      error: () => (this.joinRequests = [])
    });
  }

  approveRequest(r: any) {
    this.api.approveRequest(r.id, { requester: this.username() }).subscribe({
      next: (res: any) => {
        r.status = 'approved';
        this.fetchGroups();
        this.fetchJoinRequests();
      },
      error: (err: any) => (this.groupActionError = err?.error?.error || 'Failed to approve request')
    });
  }

  denyRequest(r: any) {
    this.api.denyRequest(r.id, { requester: this.username() }).subscribe({
      next: () => {
        r.status = 'denied';
        this.fetchJoinRequests();
      },
      error: (err: any) => (this.groupActionError = err?.error?.error || 'Failed to deny request')
    });
  }

  addGroup() {
    this.addGroupError = '';
    this.addGroupSuccess = false;
    this.newGroup.ownerUsername = this.username();
    // optimistic create: add a temporary group locally so UI updates immediately
    const tempId = 'tmp-' + Date.now();
    const owner = this.username();
    const tempGroup = {
      id: tempId,
      name: this.newGroup.name,
      ownerUsername: owner,
      admins: [owner],
      members: [owner],
      channels: [],
      newMember: '',
      newChannel: '',
      displayMembers: [owner]
    };
    this.groups = [...(this.groups || []), tempGroup];
    try { this.cdr.detectChanges(); } catch (e) {}

    this.api.addGroup(this.newGroup).subscribe({
      next: (res: any) => {
        this.addGroupSuccess = true;
        // replace temp group with server group
        const created = res?.group;
        if (created) {
          this.groups = (this.groups || []).map(g => (g.id === tempId ? { ...created, newMember: '', newChannel: '', displayMembers: (created.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super') } : g));
        }
        this.newGroup = { name: '', ownerUsername: '' };
        try { this.cdr.detectChanges(); } catch (e) {}
      },
      error: (err: any) => {
        this.addGroupError = err?.error?.error || 'Failed to add group.';
        // rollback temp group
        this.groups = (this.groups || []).filter(g => g.id !== tempId);
        try { this.cdr.detectChanges(); } catch (e) {}
      }
    });
  }

  addMemberToGroup(group: any) {
    this.groupActionError = '';
    this.groupActionSuccess = '';
    if (!group.newMember) return;
    // optimistic add: update UI immediately
    const username = group.newMember.trim();
    group.members = group.members || [];
    const already = group.members.some((m: any) => (m || '').toLowerCase() === username.toLowerCase());
    if (!already) {
      group.members = [...group.members, username];
      group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
      try { this.cdr.detectChanges(); } catch (e) {}
    }
    group.newMember = '';

    this.api.addGroupMember(group.id, { username, requester: this.username() }).subscribe({
      next: () => {
        this.groupActionSuccess = 'Member added!';
      },
      error: (err: any) => {
        // rollback
        group.members = (group.members || []).filter((m: any) => (m || '').toLowerCase() !== username.toLowerCase());
        group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
        this.groupActionError = err?.error?.error || 'Failed to add member.';
        try { this.cdr.detectChanges(); } catch (e) {}
      }
    });
  }

  addChannelToGroup(group: any) {
    this.groupActionError = '';
    this.groupActionSuccess = '';
    if (!group.newChannel) return;
    // optimistic add
    const name = group.newChannel.trim();
    group.channels = group.channels || [];
    const exists = group.channels.some((c: any) => (c.name || '').toLowerCase() === name.toLowerCase());
    if (!exists) {
      const tempChannel = { id: 'tmp-' + Date.now(), name };
      group.channels = [...group.channels, tempChannel];
      try { this.cdr.detectChanges(); } catch (e) {}
    }
    group.newChannel = '';

    this.api.addChannel(group.id, { name, requester: this.username() }).subscribe({
      next: (res: any) => {
        const ch = res?.channel;
        if (ch) {
          group.channels = (group.channels || []).map((c: any) => (c.name === name && c.id && String(c.id).startsWith('tmp') ? ch : c));
          try { this.cdr.detectChanges(); } catch (e) {}
        }
        this.groupActionSuccess = 'Channel added!';
      },
      error: (err: any) => {
        // rollback temp channel
        group.channels = (group.channels || []).filter((c: any) => (c.name || '').toLowerCase() !== name.toLowerCase() || !(String(c.id || '').startsWith('tmp')));
        this.groupActionError = err?.error?.error || 'Failed to add channel.';
        try { this.cdr.detectChanges(); } catch (e) {}
      }
    });
  }

  editGroup(group: any) {
    alert('Edit group feature coming soon!');
  }

  deleteGroup(group: any) {
    if (!confirm(`Delete group ${group.name}?`)) return;
    this.groupActionError = '';
    this.groupActionSuccess = '';
  this.api.deleteGroup(group.id, { requester: this.username() }).subscribe({
      next: () => {
        this.groupActionSuccess = 'Group deleted!';
        this.groups = this.groups.filter((g: any) => g.id !== group.id);
      },
      error: (err: any) => {
        this.groupActionError = err?.error?.error || 'Failed to delete group.';
      }
    });
  }
  

  removeMemberFromGroup(group: any, username: string) {
    if (!confirm(`Remove ${username} from ${group.name}?`)) return;
    this.groupActionError = '';
    this.groupActionSuccess = '';
    // optimistic remove
    const prev = [...(group.members || [])];
    group.members = (group.members || []).filter((m: any) => (m || '').toLowerCase() !== (username || '').toLowerCase());
    group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
    try { this.cdr.detectChanges(); } catch (e) {}

    this.api.removeGroupMember(group.id, { username, requester: this.username() }).subscribe({
      next: () => {
        this.groupActionSuccess = 'Member removed!';
      },
      error: (err: any) => {
        // rollback
        group.members = prev;
        group.displayMembers = (group.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
        this.groupActionError = err?.error?.error || 'Failed to remove member.';
        try { this.cdr.detectChanges(); } catch (e) {}
      }
    });
  }

  promoteToGroupAdmin(group: any, username: string) {
    /**
     * Promote a group member to a group admin.
     * Note: the server requires the target user to already have the 'Group Admin' role
     * (promoted by a Super Admin) before they can be assigned as a group admin.
     * This method performs an optimistic UI update and rolls back on failure.
     */
    this.groupActionError = '';
    this.groupActionSuccess = '';
    // optimistic promote
    group.admins = group.admins || [];
    const already = group.admins.some((a: any) => (a || '').toLowerCase() === (username || '').toLowerCase());
    if (!already) {
      group.admins = [...group.admins, username];
      try { this.cdr.detectChanges(); } catch (e) {}
    }

    this.api.addAdminToGroup(group.id, { username, requester: this.username() }).subscribe({
      next: () => {
        this.groupActionSuccess = 'Admin assigned to group.';
      },
      error: (err: any) => {
        // rollback
        group.admins = (group.admins || []).filter((a: any) => (a || '').toLowerCase() !== (username || '').toLowerCase());
        this.groupActionError = err?.error?.error || 'Failed to assign admin.';
        try { this.cdr.detectChanges(); } catch (e) {}
      }
    });
  }

  fetchUsers() {
    this.api.getUsers().subscribe({
      next: (res: any) => {
        this.users = res.users || [];
      }
    });
  }

  ngOnInit() {
    this.fetchUsers();
    this.fetchGroups();
  this.fetchJoinRequests();
  }

  addUser() {
    this.addUserError = '';
    this.addUserSuccess = false;
    this.api.addUser(this.newUser).subscribe({
      next: (res: any) => {
        this.addUserSuccess = true;
        // immediate optimistic update so super sees the new user without refreshing
        const created = res?.user;
        if (created) {
          this.users = this.users || [];
          const exists = this.users.some((u: any) => u.id === created.id || (u.username || '').toLowerCase() === (created.username || '').toLowerCase());
          if (!exists) {
            this.users = [...this.users, created];
            // ensure Angular picks up the change immediately
            try { this.cdr.detectChanges(); } catch (e) { /* ignore if change detection already running */ }
          }
        }
  this.newUser = { username: '', email: '', password: '' };
  // keep a background sync to ensure server state is current but avoid immediate overwrite
  setTimeout(() => this.fetchUsers(), 300);
      },
      error: (err: any) => {
        this.addUserError = err?.error?.error || 'Failed to add user.';
      }
    });
  }
}
