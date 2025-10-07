// @ts-nocheck
/// <reference types="cypress" />

// Ensure empty or whitespace-only messages cannot be sent and button is disabled when input empty.

describe('Chat Empty Message Guard', () => {
  const unique = Date.now();
  const groupName = `ChatEmpty_${unique}`;
  const channelName = `chan_${unique}`;

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  beforeEach(() => {
    // Re-authenticate each test (Cypress may clear localStorage between tests)
    cy.apiLogin('super');
    cy.visit('/chat');
    cy.selectGroupChannel(groupName, channelName);
  });

  it('disables send button when input empty', () => {
    cy.get('[data-cy=chat-input]').clear();
    cy.get('[data-cy=chat-send]').should('be.disabled');
  });

  it('does not create a message for pure whitespace', () => {
    cy.get('[data-cy=message-list] [data-cy^=message-]').then($initial => {
      const initialCount = $initial.length;
      cy.get('[data-cy=chat-input]').clear().type('    ');
      cy.get('[data-cy=chat-send]').should('be.disabled');
      // Force submit attempt via Enter key
      cy.get('[data-cy=chat-input]').type('{enter}');
      // Wait briefly for any potential (incorrect) message emission
      cy.wait(300);
      cy.get('[data-cy=message-list] [data-cy^=message-]').should('have.length', initialCount);
    });
  });
});
