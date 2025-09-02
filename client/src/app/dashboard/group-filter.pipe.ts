import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'groupFilter', standalone: true })
export class GroupFilterPipe implements PipeTransform {
  transform(groups: any[], search: string): any[] {
    if (!groups || !search) return groups;
    const term = search.toLowerCase();
    return groups.filter(g => g.name.toLowerCase().includes(term));
  }
}
