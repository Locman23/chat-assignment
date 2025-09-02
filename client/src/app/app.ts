import { Component, signal } from '@angular/core';
import { RouterOutlet, RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Auth } from './auth.service';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrls: ['./app.scss']
})
export class App {
  protected readonly title = signal('client');
  // current year for footer (templates cannot use `new` operator)
  readonly year = new Date().getFullYear();
  constructor(private auth: Auth, private router: Router) {}

  isAuthed() { return this.auth.isAuthed(); }
  username() { return this.auth.user()?.username ?? ''; }
  logout() { this.auth.logout(); this.router.navigate(['/login']); }
}
