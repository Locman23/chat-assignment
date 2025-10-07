// @ts-nocheck
/// <reference types="cypress" />

describe('Dashboard Users Management', () => {
  before(() => {
    // Login as super admin via API
    cy.apiLogin('super');
  });

  beforeEach(() => {
    // Preserve auth between tests
    cy.visit('/dashboard');
  });

  it('adds a new user, changes role, then deletes the user', () => {
    const uname = 'user_' + Date.now();
    cy.get('[data-cy=add-user-username]').clear().type(uname);
    cy.get('[data-cy=add-user-email]').clear().type(`${uname}@example.test`);
    cy.get('[data-cy=add-user-password]').clear().type('123');
    cy.get('[data-cy=add-user-submit]').click();

    cy.get(`[data-cy=user-row-${uname}]`, { timeout: 10000 }).should('exist');

    // Change role (if dropdown present)
    cy.get(`[data-cy=user-row-${uname}] select`).select('Group Admin');
    cy.contains('Role updated').should('exist');

    // Delete user
    cy.get(`[data-cy=user-row-${uname}] button`).contains('Delete').click();
    // Confirm dialog appears - app currently uses confirm(); Cypress auto-accepts by default unless stubbed
    cy.get(`[data-cy=user-row-${uname}]`).should('not.exist');
  });
});
