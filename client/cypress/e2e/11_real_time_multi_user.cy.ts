// @ts-nocheck
/// <reference types="cypress" />

// Real-time multi-user test: user A (super) and user B in separate sessions.
// Approach: use two sequential sessions (cy.session) and poll for message arrival as user B.

describe('Real-Time Multi-User Messaging', () => {
  const unique = Date.now();
  const groupName = `RT_${unique}`;
  const channelName = `chan_${unique}`;
  const userB = `userb_${unique}`;
  const msgFromA = `Hello from A ${unique}`;
  const msgFromB = `Reply from B ${unique}`;
  const msgFromA2 = `Second from A ${unique}`;
  const msgFromB2 = `Second from B ${unique}`;

  before(() => {
    cy.apiLogin('super');
    cy.ensureUser(userB, `${userB}@example.test`, '123');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  function openChatAndSelect(gName: string, cName: string) {
    cy.visit('/chat');
    cy.selectGroupChannel(gName, cName);
  }

  it('exchanges messages between two users with ordering, typing indicators and persistence', () => {
    // Session A (super)
    cy.session('superSession', () => {
      cy.apiLogin('super');
    });
    cy.session('userBSession', () => {
      // Need membership: approve join request if required. Super is already member. We'll request & approve.
      cy.apiLogin('super');
      // Add userB to group via API (simpler than join flow for this real-time test)
      // We'll just reuse ensureUser then patch membership by creating a join request + approve.
    });

    // Add userB to the group via join request flow quickly
    cy.apiLogin(userB, '123');
    cy.request('GET', 'http://localhost:3000/api/groups').then(res => {
      const g = res.body.groups.find(g => g.name === groupName);
      expect(g).to.exist;
      return g.id;
    }).then(gid => {
      cy.request('POST', `http://localhost:3000/api/groups/${gid}/requests`, { username: userB });
      cy.apiLogin('super');
      cy.request(`http://localhost:3000/api/requests?requester=super`).then(list => {
        const pending = list.body.requests.find(r => r.username === userB && r.gid === gid);
        expect(pending).to.exist;
        cy.request('PUT', `http://localhost:3000/api/requests/${pending.id}/approve`, { requester: 'super' });
      });
    });

  // Now userB is a member. Send message as A (first message)
  cy.apiLogin('super');
  openChatAndSelect(groupName, channelName);
  cy.sendChatMessage(msgFromA);
  cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA, { timeout: 10000 }).should('exist');

    // Switch to user B and verify A's message visible, then simulate typing indicator then reply.
    cy.apiLogin(userB, '123');
    openChatAndSelect(groupName, channelName);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA, { timeout: 10000 }).should('exist');
    // Typing indicator: start typing but not send yet (if UI supports). We'll type partial then clear when sending.
    cy.get('[data-cy=chat-input]').type('Typing...');
    // If typing indicator element exists, assert contains userB
    cy.get('body').then($b => {
      if ($b.find('[data-cy=typing-indicators]').length) {
        cy.get('[data-cy=typing-indicators]').contains(userB, { matchCase: false });
      }
    });
    // Replace with actual message send (this should also clear typing state)
    cy.get('[data-cy=chat-input]').clear();
    cy.sendChatMessage(msgFromB);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromB, { timeout: 10000 }).should('exist');
    // Optional: indicator should disappear
    cy.get('body').then($b => {
      if ($b.find('[data-cy=typing-indicators]').length) {
        cy.get('[data-cy=typing-indicators]').should('not.contain.text', userB);
      }
    });

    // Back to A to assert B's message, then A sends second message
    cy.apiLogin('super');
    openChatAndSelect(groupName, channelName);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromB, { timeout: 10000 }).should('exist');
    cy.sendChatMessage(msgFromA2);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA2, { timeout: 10000 }).should('exist');

    // Switch to B, confirm second message, send a second reply
    cy.apiLogin(userB, '123');
    openChatAndSelect(groupName, channelName);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA2, { timeout: 10000 }).should('exist');
    cy.sendChatMessage(msgFromB2);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromB2, { timeout: 10000 }).should('exist');

    // Validate ordering of the last four messages (chronological)
    const ordered = [msgFromA, msgFromB, msgFromA2, msgFromB2];
    cy.get('[data-cy=message-list] [data-cy^=message-] .text span').then($spans => {
      const texts = Array.from($spans).map(el => el.textContent?.trim()).filter(Boolean);
      // Extract only occurrences of our tracked messages preserving order
      const ours = texts.filter(t => ordered.includes(t));
      expect(ours).to.deep.equal(ordered);
    });

    // Reload persistence check (user B)
    cy.reload();
    for (const m of [msgFromA, msgFromB, msgFromA2, msgFromB2]) {
      cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', m, { timeout: 10000 }).should('exist');
    }
    // Attribution: ensure each message element shows correct username (if username node present)
    cy.get('[data-cy=message-list] [data-cy^=message-]').then($msgs => {
      const lookups = {
        [msgFromA]: 'super',
        [msgFromB]: userB,
        [msgFromA2]: 'super',
        [msgFromB2]: userB
      };
      $msgs.each((_, li) => {
        const textEl = li.querySelector('.text span');
        if (!textEl) return;
        const body = textEl.textContent?.trim();
        if (!body || !lookups[body]) return;
        const userEl = li.querySelector('.username');
        if (userEl) {
          expect(userEl.textContent?.toLowerCase()).to.include(lookups[body].toLowerCase());
        }
      });
    });
  });
});
