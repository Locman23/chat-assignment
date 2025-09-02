import { Component, computed, OnInit } from '@angular/core';
import { UserFilterPipe } from './user-filter.pipe';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '../auth.service';
import { Router } from '@angular/router';
import { Api } from '../api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, UserFilterPipe],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  userSearch: string = '';
  userActionError: string = '';
  userActionSuccess: string = '';

  newUser = { username: '', email: '', password: '' };
  addUserError = '';
  addUserSuccess = false;
  users: any[] = [];

  groups: any[] = [];
  selectedGroupId: string = '';

  members: string[] = [];
  newMember = { username: '' };
  addMemberError = '';
  addMemberSuccess = false;

  newGroup = { name: '', ownerUsername: '' };
  addGroupError = '';
  addGroupSuccess = false;

  channels: any[] = [];
  newChannel = { name: '' };
  addChannelError = '';
  addChannelSuccess = false;

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

  fetchGroups() {
    this.api.getGroups().subscribe({
      next: (res: any) => {
        this.groups = res.groups || [];
        if (this.groups.length) {
          this.selectedGroupId = this.groups[0].id;
          this.fetchMembers();
          this.fetchChannels();
        }
      }
    });
  }

  fetchMembers() {
    if (!this.selectedGroupId) return;
    this.api.getGroupMembers(this.selectedGroupId).subscribe({
      next: (res: any) => {
        this.members = res.members || [];
      }
    });
  }

  addMember() {
    this.addMemberError = '';
    this.addMemberSuccess = false;
    this.api.addGroupMember(this.selectedGroupId, this.newMember).subscribe({
      next: (res: any) => {
        this.addMemberSuccess = true;
        this.newMember = { username: '' };
        this.fetchMembers();
      },
      error: (err: any) => {
        this.addMemberError = err?.error?.error || 'Failed to add member.';
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

  fetchChannels() {
    if (!this.selectedGroupId) return;
    this.api.getChannels(this.selectedGroupId).subscribe({
      next: (res: any) => {
        this.channels = res.channels || [];
      }
    });
  }

  addChannel() {
    this.addChannelError = '';
    this.addChannelSuccess = false;
    this.api.addChannel(this.selectedGroupId, this.newChannel).subscribe({
      next: (res: any) => {
        this.addChannelSuccess = true;
        this.newChannel = { name: '' };
        this.fetchChannels();
      },
      error: (err: any) => {
        this.addChannelError = err?.error?.error || 'Failed to add channel.';
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
