// @ts-nocheck
/// <reference types="cypress" />

// Basic groups + channel creation flow as Super Admin, then verify in chat UI.

describe('Groups Basic Flow', () => {
  const unique = Date.now();
  const groupName = `Group_${unique}`;
  const channelName = `chan_${unique}`;

  before(() => {
    cy.apiLogin('super');
  });

  it('creates a group, adds a channel, and sees it in chat', () => {
    cy.visit('/dashboard');
    // Create group
    cy.get('[data-cy=add-group-name]').type(groupName);
    cy.get('[data-cy=add-group-submit]').click();

    cy.contains('[data-cy^=group-row-] td', groupName, { timeout: 10000 }).should('exist');

    // Because channels are loaded asynchronously, re-find the row once group is persisted.
    // Add channel (need to locate the matching group row then the channel add form)
    cy.contains('tr[data-cy^=group-row-] td', groupName)
      .closest('tr')
      .within(() => {
        // Select the add-channel form specifically by its input placeholder
        cy.get('form').filter((_, el)=> !!el.querySelector('input[placeholder="Add channel..."]'))
          .within(() => {
            cy.get('input[placeholder="Add channel..."]').type(channelName);
            cy.get('button[type=submit]').click();
          });
      });

    // Verify channel name now listed within that group row
    cy.contains('tr[data-cy^=group-row-] td', groupName)
      .parents('tr')
      .should('contain.text', channelName);

    // Navigate to chat and ensure group appears
    cy.visit('/chat');
    cy.get('[data-cy=group-list]', { timeout: 10000 }).should('exist');
    cy.get('[data-cy=group-list]').within(() => {
      cy.contains('.group-item .group-name', groupName)
        .parents('.group-item')
        .find('button.group-btn')
        .first()
        .click();
    });

    // After selecting group, channel list should show our channel
  cy.get('[data-cy^=channel-item-]').contains(channelName).first().click();

    // Chat header reflects group + channel
    cy.get('h2').should('contain.text', groupName).and('contain.text', channelName.replace(/^#?/, ''));
  });
});
