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
  uploading = false;
  avatarPreview: string | undefined;

  constructor(private api: Api, public auth: Auth, private router: Router) {}

  ngOnInit(): void {
    const u = this.auth.user();
    if (!u) { this.router.navigate(['/login']); return; }
    if ((u.username || '').toLowerCase() === 'super') { this.router.navigate(['/dashboard']); return; }
    this.form.username = u.username || '';
    this.form.email = u.email || '';
    if (u.avatarUrl) this.avatarPreview = this.makeAbsolute(u.avatarUrl);
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

  async onAvatarChange(ev: Event) {
    const input = ev.target as HTMLInputElement;
    if (!input.files || !input.files.length) return;
    const file = input.files[0];
    if (!file.type.startsWith('image/')) { this.error = 'Invalid image type'; return; }
    const u = this.auth.user();
    if (!u) { this.error = 'Not authenticated'; return; }
    this.error = ''; this.success = '';
    this.uploading = true;
    try {
      const res: any = await this.api.uploadAvatar(file, u.username).toPromise();
      if (res?.ok) {
        const updated = res.user as User;
  this.auth.login(updated);
  this.avatarPreview = res.avatarUrl ? this.makeAbsolute(res.avatarUrl) : this.makeAbsolute(updated.avatarUrl || '');
        this.success = 'Avatar updated';
      } else {
        this.error = 'Upload failed';
      }
    } catch (e: any) {
      this.error = e?.error?.error || 'Upload failed';
    } finally {
      this.uploading = false;
      input.value = '';
    }
  }

  private makeAbsolute(url: string) {
    if (!url) return url;
    if (/^https?:\/\//i.test(url)) return url;
    return `http://localhost:3000${url}`;
  }
}
