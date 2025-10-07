// Central configuration for client base URLs so we avoid scattering hard-coded localhost strings.
// In a production build you could swap this file or read from environment (e.g., using Angular file replacements).

export const API_BASE = (window as any).__CHAT_API_BASE__ || 'http://localhost:3000/api';
export const SOCKET_BASE = (window as any).__CHAT_SOCKET_BASE__ || 'http://localhost:3000';
export const PUBLIC_BASE = (window as any).__CHAT_PUBLIC_BASE__ || 'http://localhost:3000';

export function absoluteUrl(rel?: string) {
  if (!rel) return rel;
  if (/^https?:\/\//i.test(rel)) return rel;
  return `${PUBLIC_BASE}${rel}`;
}