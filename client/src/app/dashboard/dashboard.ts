import { Component, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '../auth.service';
import { Router } from '@angular/router';
import { Api } from '../api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html'
})
export class Dashboard implements OnInit {
  constructor(private auth: Auth, private router: Router, private api: Api) {}
  username = computed(() => this.auth.user()?.username ?? '');
  isSuper = () => this.auth.hasRole('Super Admin');

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }

  newUser = { username: '', email: '' };
  addUserError = '';
  addUserSuccess = false;
  users: any[] = [];

  groups: any[] = [];
  selectedGroupId: string = '';

  fetchGroups() {
    const cached = localStorage.getItem('groups');
    if (cached) {
      this.groups = JSON.parse(cached);
      if (this.groups.length) {
        this.selectedGroupId = this.groups[0].id;
        this.fetchMembers();
        this.channels = this.groups.find(g => g.id === this.selectedGroupId)?.channels || [];
      }
    }
    this.api.getGroups().subscribe({
      next: (res) => {
        this.groups = res.groups || [];
        localStorage.setItem('groups', JSON.stringify(this.groups));
        if (this.groups.length) {
          this.selectedGroupId = this.groups[0].id;
          this.fetchMembers();
          this.channels = this.groups[0].channels || [];
        }
      }
    });
  }

  members: string[] = [];
  newMember = { username: '' };
  addMemberError = '';
  addMemberSuccess = false;

  fetchMembers() {
    if (!this.selectedGroupId) return;
    this.api.getGroupMembers(this.selectedGroupId).subscribe({
      next: (res) => {
        this.members = res.members || [];
      }
    });
  }

  addMember() {
    this.addMemberError = '';
    this.addMemberSuccess = false;
    this.api.addGroupMember(this.selectedGroupId, this.newMember).subscribe({
      next: (res) => {
        this.addMemberSuccess = true;
        this.newMember = { username: '' };
        this.fetchMembers();
      },
      error: (err) => {
        this.addMemberError = err?.error?.error || 'Failed to add member.';
      }
    });
  }

  newGroup = { name: '', ownerUsername: '' };
  addGroupError = '';
  addGroupSuccess = false;

  addGroup() {
    this.addGroupError = '';
    this.addGroupSuccess = false;
    this.newGroup.ownerUsername = this.username();
    this.api.addGroup(this.newGroup).subscribe({
      next: (res) => {
        this.addGroupSuccess = true;
        this.newGroup = { name: '', ownerUsername: '' };
        this.fetchGroups();
      },
      error: (err) => {
        this.addGroupError = err?.error?.error || 'Failed to add group.';
      }
    });
  }

  channels: any[] = [];
  newChannel = { name: '' };
  addChannelError = '';
  addChannelSuccess = false;

  fetchChannels() {
    if (!this.selectedGroupId) return;
    this.api.getChannels(this.selectedGroupId).subscribe({
      next: (res) => {
        this.channels = res.channels || [];
        // update channels in cached groups
        const cached = localStorage.getItem('groups');
        let groups = cached ? JSON.parse(cached) : [];
        const idx = groups.findIndex((g: any) => g.id === this.selectedGroupId);
        if (idx !== -1) {
          groups[idx].channels = this.channels;
          localStorage.setItem('groups', JSON.stringify(groups));
        }
      }
    });
  }

  addChannel() {
    this.addChannelError = '';
    this.addChannelSuccess = false;
    this.api.addChannel(this.selectedGroupId, this.newChannel).subscribe({
      next: (res) => {
        this.addChannelSuccess = true;
        this.newChannel = { name: '' };
        this.fetchChannels();
      },
      error: (err) => {
        this.addChannelError = err?.error?.error || 'Failed to add channel.';
      }
    });
  }

  fetchUsers() {
    const cached = localStorage.getItem('users');
    if (cached) {
      this.users = JSON.parse(cached);
    }
    this.api.getUsers().subscribe({
      next: (res) => {
        this.users = res.users || [];
        localStorage.setItem('users', JSON.stringify(this.users));
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
      next: (res) => {
        this.addUserSuccess = true;
        this.newUser = { username: '', email: '' };
        this.fetchUsers();
      },
      error: (err) => {
        this.addUserError = err?.error?.error || 'Failed to add user.';
      }
    });
  }
}
