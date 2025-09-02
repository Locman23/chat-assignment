
import { Component, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Auth } from '../auth.service';
import { Api } from '../api.service';
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

  newGroup: { name: string; ownerUsername: string } = { name: '', ownerUsername: '' };
  addGroupError = '';
  addGroupSuccess = false;

  constructor(private auth: Auth, private router: Router, private api: Api) {}
  username = computed(() => this.auth.user()?.username ?? '');
  isSuper = () => this.auth.hasRole('Super Admin');

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  changeUserRole(user: any) {
    this.userActionError = '';
    this.userActionSuccess = '';
    this.api.changeUserRole(user.id, user.roles[0]).subscribe({
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
    this.api.deleteUser(user.id).subscribe({
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
          group.channels = group.channels || [];

          // fetch latest members
          this.api.getGroupMembers(group.id).subscribe({
            next: (r: any) => (group.members = r.members || []),
            error: () => (group.members = group.members || [])
          });

          // fetch latest channels
          this.api.getChannels(group.id).subscribe({
            next: (r: any) => (group.channels = r.channels || []),
            error: () => (group.channels = group.channels || [])
          });
        });

        if (this.groups.length) this.selectedGroupId = this.groups[0].id;
      },
      error: () => {
        this.groups = [];
      }
    });
  }

  addGroup() {
    this.addGroupError = '';
    this.addGroupSuccess = false;
    this.newGroup.ownerUsername = this.username();
    this.api.addGroup(this.newGroup).subscribe({
      next: (res: any) => {
        this.addGroupSuccess = true;
        this.newGroup = { name: '', ownerUsername: '' };
  this.fetchGroups();
      },
      error: (err: any) => {
        this.addGroupError = err?.error?.error || 'Failed to add group.';
      }
    });
  }

  addMemberToGroup(group: any) {
    this.groupActionError = '';
    this.groupActionSuccess = '';
    if (!group.newMember) return;
    this.api.addGroupMember(group.id, { username: group.newMember }).subscribe({
      next: (res: any) => {
  group.members = group.members || [];
  group.members.push(group.newMember);
        group.newMember = '';
        this.groupActionSuccess = 'Member added!';
      },
      error: (err: any) => {
        this.groupActionError = err?.error?.error || 'Failed to add member.';
      }
    });
  }

  addChannelToGroup(group: any) {
    this.groupActionError = '';
    this.groupActionSuccess = '';
    if (!group.newChannel) return;
    this.api.addChannel(group.id, { name: group.newChannel }).subscribe({
      next: (res: any) => {
  group.channels = group.channels || [];
  group.channels.push({ name: group.newChannel });
        group.newChannel = '';
        this.groupActionSuccess = 'Channel added!';
      },
      error: (err: any) => {
        this.groupActionError = err?.error?.error || 'Failed to add channel.';
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
    this.api.deleteGroup(group.id).subscribe({
      next: () => {
        this.groupActionSuccess = 'Group deleted!';
        this.groups = this.groups.filter((g: any) => g.id !== group.id);
      },
      error: (err: any) => {
        this.groupActionError = err?.error?.error || 'Failed to delete group.';
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
  }

  addUser() {
    this.addUserError = '';
    this.addUserSuccess = false;
    this.api.addUser(this.newUser).subscribe({
      next: (res: any) => {
        this.addUserSuccess = true;
        this.newUser = { username: '', email: '', password: '' };
        this.fetchUsers();
      },
      error: (err: any) => {
        this.addUserError = err?.error?.error || 'Failed to add user.';
      }
    });
  }
}
