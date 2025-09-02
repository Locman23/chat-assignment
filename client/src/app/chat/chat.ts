import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { Api } from '../api.service';
import { Auth } from '../auth.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './chat.html',
  styleUrls: []
})
export class Chat implements OnInit {
  groups: any[] = [];

  constructor(private api: Api, private auth: Auth) {}

  ngOnInit(): void {
    this.loadGroups();
  }

  loadGroups() {
    this.api.getGroups().subscribe({
      next: (res: any) => {
        this.groups = (res.groups || []).map((g: any) => ({ ...g }));
      },
      error: () => (this.groups = [])
    });
  }

  // Utility to compute displayable members (hide 'super')
  displayMembers(g: any) {
    return (g.members || []).filter((m: string) => (m || '').toLowerCase() !== 'super');
  }
}
