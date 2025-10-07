// @ts-nocheck
/// <reference types="cypress" />

// Basic chat message flow: ensure group+channel, join, send, verify message.

describe('Chat Basic Flow', () => {
  const unique = Date.now();
  const groupName = `ChatGroup_${unique}`;
  const channelName = `general_${unique}`;
  const messageText = `Hello world ${unique}`;

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName).then(ctx => {
      // store ids if needed later
      Cypress.env('chatGroupId', ctx.groupId);
      Cypress.env('chatChannelId', ctx.channelId);
    });
  });

  it('sends a chat message and sees it appear', () => {
    cy.visit('/chat');

    cy.selectGroupChannel(groupName, channelName);

    // Type and send message
  cy.sendChatMessage(messageText);

    // Assert message appears (retry behavior built-in)
    cy.get('[data-cy=message-list] [data-cy^=message-]')
      .should('contain.text', messageText)
      .and('contain.text', 'super');
  });
});
