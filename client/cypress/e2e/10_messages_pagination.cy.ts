// @ts-nocheck
/// <reference types="cypress" />

// Verifies loading older messages via pagination (prepend behavior).
// We create > HISTORY_PAGE_SIZE messages by sending them through the socket/API path sequentially.

describe('Messages Pagination', () => {
  const unique = Date.now();
  const groupName = `Hist_${unique}`;
  const channelName = `chan_${unique}`;
  const totalMessages = 60; // > default HISTORY_PAGE_SIZE (50)

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  beforeEach(() => {
    cy.apiLogin('super');
    cy.visit('/chat');
    cy.selectGroupChannel(groupName, channelName);
  });

  it('loads older messages when clicking Load older', () => {
    const targetToSeed = totalMessages;
    function seedUI(count: number) {
      for (let i = 0; i < count; i++) {
  const text = `HistMsg ${unique} ${i}`;
  cy.sendChatMessage(text);
  cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', text, { timeout: 10000 });
      }
    }

    cy.get('[data-cy=message-list] [data-cy^=message-]').then($existing => {
      if ($existing.length < targetToSeed - 5) seedUI(targetToSeed);
    });

    // Reload chat to fetch last page from history (ensures hasMore)
    cy.visit('/chat');
    cy.get('[data-cy=group-list]', { timeout: 10000 }).within(() => {
      cy.contains('.group-item .group-name', groupName, { timeout: 10000 })
        .parents('.group-item')
        .find('button.group-btn')
        .first()
        .click();
    });
    cy.contains('[data-cy^=channel-item-]', channelName, { timeout: 10000 }).click();

    // Initially should show only the latest page (<= 50). Scroll top to reveal load button.
    cy.get('[data-cy=message-list] [data-cy^=message-]').its('length').should('be.lte', 50);

    cy.get('[data-cy=chat-scroll]').then($el => { $el[0].scrollTop = 0; });
    cy.get('[data-cy=load-older-btn]', { timeout: 10000 }).should('exist').click();
    cy.get('[data-cy=message-list] [data-cy^=message-]').its('length').should('be.greaterThan', 50);
  });
});
