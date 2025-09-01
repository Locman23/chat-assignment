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
    this.api.getGroups().subscribe({
      next: (res) => {
        this.groups = res.groups || [];
        if (this.groups.length) {
          this.selectedGroupId = this.groups[0].id;
          this.fetchMembers();
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

  ngOnInit() {
    this.api.getUsers().subscribe({
      next: (res) => {
        this.users = res.users || [];
      }
    });
    this.fetchGroups();
  }

  addUser() {
    this.addUserError = '';
    this.addUserSuccess = false;
    this.api.addUser(this.newUser).subscribe({
      next: (res) => {
        this.addUserSuccess = true;
        this.newUser = { username: '', email: '' };
        this.api.getUsers().subscribe({
          next: (res) => {
            this.users = res.users || [];
          }
        });
      },
      error: (err) => {
        this.addUserError = err?.error?.error || 'Failed to add user.';
      }
    });
  }
}
