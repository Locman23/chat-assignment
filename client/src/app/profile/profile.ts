import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { Api } from '../api.service';
import { Auth, User } from '../auth.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.scss']
})
export class Profile implements OnInit {
  form: { username: string; email: string; password: string } = { username: '', email: '', password: '' };
  error = '';
  success = '';

  constructor(private api: Api, private auth: Auth, private router: Router) {}

  ngOnInit(): void {
    const u = this.auth.user();
    if (!u) { this.router.navigate(['/login']); return; }
    if ((u.username || '').toLowerCase() === 'super') { this.router.navigate(['/dashboard']); return; }
    this.form.username = u.username || '';
    this.form.email = u.email || '';
  }

  save() {
    this.error = '';
    this.success = '';
    const u = this.auth.user();
    if (!u) { this.error = 'Not authenticated'; return; }

  const payload: any = { username: this.form.username, email: this.form.email, requester: u.username };
  if (this.form.password && this.form.password.trim() !== '') payload.password = this.form.password;

  this.api.updateUserProfile(u.id, payload).subscribe({
      next: (res: any) => {
        this.success = 'Profile updated';
        // Refresh auth user in client storage
        const updated = res.user;
        this.auth.login(updated as User);
        this.form.password = '';
      },
      error: (err: any) => {
        this.error = err?.error?.error || 'Failed to update profile';
      }
    });
  }
}
