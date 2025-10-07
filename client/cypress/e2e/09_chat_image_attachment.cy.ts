// @ts-nocheck
/// <reference types="cypress" />

// Sends a message with an image attachment and verifies it renders.
// Uses a small base64 PNG fixture created inline to avoid external files.

describe('Chat Image Attachment', () => {
  const unique = Date.now();
  const groupName = `Img_${unique}`;
  const channelName = `chan_${unique}`;
  const messageText = `Image test ${unique}`;

  // 1x1 transparent PNG
  const base64Png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  beforeEach(() => {
    cy.apiLogin('super');
    cy.visit('/chat');
    cy.selectGroupChannel(groupName, channelName);
  });

  it('uploads and displays an image attachment', () => {
    // Intercept upload to ensure server receives it (optional - we just rely on UI)
    const fileName = 'tiny.png';
    const mime = 'image/png';

    // Type message first so onSelectImage sends it along with image
    cy.get('[data-cy=chat-input]').clear().type(messageText);

    cy.window().then(win => {
      const byteCharacters = atob(base64Png);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mime });
      const file = new File([blob], fileName, { type: mime });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = win.document.querySelector('[data-cy=chat-image-input]') as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // After upload+send, component clears messageText
    cy.get('[data-cy=chat-input]', { timeout: 15000 }).should('have.value', '');

    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', messageText, { timeout: 20000 })
      .closest('[data-cy^=message-]')
      .should('exist')
      .within(() => {
        cy.get('.attachments img', { timeout: 10000 }).first().should($img => {
          const src = $img.attr('src') || '';
          expect(/^https?:\/\//.test(src), 'image src should be absolute').to.be.true;
        });
      });
  });
});
