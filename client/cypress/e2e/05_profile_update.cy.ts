// @ts-nocheck
/// <reference types="cypress" />

// Profile update flow: create a normal user (not super), login as that user via UI, update username/email, verify persistence after reload.

describe('Profile Update', () => {
  const unique = Date.now();
  const originalUser = `prof_${unique}`;
  const originalEmail = `${originalUser}@example.test`;
  const newUsername = `${originalUser}_new`;
  const newEmail = `${newUsername}@example.test`;

  before(() => {
    // Login as super to create the normal user
    cy.apiLogin('super');
    cy.ensureUser(originalUser, originalEmail, '123');
  });

  it('logs in as the new user and updates profile', () => {
    // Clear any existing auth from localStorage first so login page isn't auto-redirected
    cy.visit('/login', { onBeforeLoad: (win) => { win.localStorage.removeItem('auth_user'); } });
    cy.get('[data-cy=login-username]').clear().type(originalUser);
    cy.get('[data-cy=login-password]').clear().type('123');
    cy.get('[data-cy=login-submit]').click();
    cy.url().should('include', '/dashboard');

    // Navigate to profile (super user is redirected away, but normal user should access)
    cy.visit('/profile');
    cy.get('[data-cy=profile-page]').should('exist');

    // Update fields
    cy.get('[data-cy=profile-username]').clear().type(newUsername);
    cy.get('[data-cy=profile-email]').clear().type(newEmail);
    cy.get('[data-cy=profile-save]').click();

    cy.get('[data-cy=profile-success]').should('contain.text', 'Profile updated');

    // Reload and ensure new values persist (stored in localStorage via auth.login)
    cy.reload();
    cy.get('[data-cy=profile-username]').should('have.value', newUsername);
    cy.get('[data-cy=profile-email]').should('have.value', newEmail);
  });
});
