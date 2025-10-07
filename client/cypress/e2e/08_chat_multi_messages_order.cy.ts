// @ts-nocheck
/// <reference types="cypress" />

// Verifies that multiple sent messages appear in order and have unique IDs.

describe('Chat Multi Message Ordering', () => {
  const unique = Date.now();
  const groupName = `Multi_${unique}`;
  const channelName = `chan_${unique}`;
  const messages = [
    `First message ${unique}`,
    `Second message ${unique}`,
    `Third message ${unique}`
  ];

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  beforeEach(() => {
    cy.apiLogin('super'); // ensure auth for each test run
    cy.visit('/chat');
    cy.selectGroupChannel(groupName, channelName);
  });

  it('sends multiple messages and preserves order', () => {
    const collected: { text: string; id: string }[] = [];

    messages.forEach(text => {
      cy.sendChatMessage(text);
      // Wait for the message to appear; then capture its id
      cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', text, { timeout: 10000 })
        .parents('[data-cy^=message-]')
        .invoke('attr', 'data-cy')
        .then(attr => {
          const id = (attr || '').replace('message-', '');
          collected.push({ text, id });
        });
    });

    cy.then(() => {
      // Ensure we collected all IDs
      expect(collected).to.have.length(messages.length);
      const ids = collected.map(c => c.id);
      // IDs should be unique
      expect(new Set(ids).size).to.eq(ids.length);
    });

    // Now assert DOM order equals messages array order (filter out system messages)
    cy.get('[data-cy=message-list] [data-cy^=message-]').then($lis => {
      const domTexts = [...$lis]
        .map(li => li.querySelector('.text span')?.textContent?.trim() || '')
        .filter(t => t && !t.startsWith('Joined') && !t.startsWith('System'));
      // Find last occurrence indices for each test message to guard against duplicates
      messages.forEach((m, idx) => {
        const domIndex = domTexts.indexOf(m);
        expect(domIndex, `message '${m}' should appear in list`).to.be.gte(0);
        if (idx > 0) {
          const prevIndex = domTexts.indexOf(messages[idx - 1]);
          expect(domIndex, `order for '${m}' vs previous`).to.be.gt(prevIndex);
        }
      });
      // Final message should match last list item text (ignoring possible trailing system messages)
      const trimmedDom = domTexts.filter(t => messages.includes(t));
      expect(trimmedDom[trimmedDom.length - 1]).to.eq(messages[messages.length - 1]);
    });
  });
});
