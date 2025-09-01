import { Component, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Auth } from '../auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html'
})
export class Dashboard {
  constructor(private auth: Auth, private router: Router) {}
  username = computed(() => this.auth.user()?.username ?? '');
  isSuper = () => this.auth.hasRole('Super Admin');

  logout() {
    this.auth.logout();
    this.router.navigate(['/login']);
  }
}
