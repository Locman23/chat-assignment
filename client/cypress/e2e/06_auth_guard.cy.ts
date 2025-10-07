// @ts-nocheck
/// <reference types="cypress" />

// Auth guard tests: ensure unauthenticated users are redirected, authenticated users can access protected routes.

describe('Auth Guard', () => {
  beforeEach(() => {
    // Ensure no auth before each test by clearing the stored user
    cy.visit('/login', { onBeforeLoad: (win) => win.localStorage.removeItem('auth_user') });
  });

  it('redirects unauthenticated user from /chat to /login', () => {
    cy.visit('/chat', { onBeforeLoad: (win) => win.localStorage.removeItem('auth_user') });
    cy.location('pathname').should('eq', '/login');
    cy.get('[data-cy=login-page]').should('exist');
  });

  it('redirects unauthenticated user from /dashboard to /login', () => {
    cy.visit('/dashboard', { onBeforeLoad: (win) => win.localStorage.removeItem('auth_user') });
    cy.location('pathname').should('eq', '/login');
  });

  it('allows authenticated user to access /chat', () => {
    cy.apiLogin('super');
    cy.visit('/chat');
    cy.location('pathname').should('eq', '/chat');
    // Assert chat page shell + sidebar present (header may show group name if auto-selected)
    cy.get('[data-cy=chat-page]').should('exist');
    cy.get('[data-cy=group-list]').should('exist');
  });
});
