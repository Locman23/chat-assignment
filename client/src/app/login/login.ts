import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Api } from '../api.service';
import { Auth } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.html'
})
export class Login implements OnInit {
  username = '';
  password = '';
  busy = false;
  error = '';

  constructor(private api: Api, private auth: Auth, private router: Router) {}

  ngOnInit() {
    if (this.auth.isAuthed()) this.router.navigate(['/dashboard']);
  }

  submit() {
    this.error = '';
    this.busy = true;
    this.api.login({ username: this.username, password: this.password })
      .subscribe({
        next: (res) => { this.auth.login(res.user); this.router.navigate(['/dashboard']); },
        error: () => { this.error = 'Invalid username/password'; this.busy = false; },
        complete: () => this.busy = false
      });
  }
}
