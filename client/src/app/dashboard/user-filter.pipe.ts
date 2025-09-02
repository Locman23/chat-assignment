import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'userFilter', standalone: true })
export class UserFilterPipe implements PipeTransform {
  transform(users: any[], search: string): any[] {
    if (!search) return users;
    const term = search.toLowerCase();
    return users.filter(u =>
      u.username.toLowerCase().includes(term) ||
      (u.email && u.email.toLowerCase().includes(term))
    );
  }
}