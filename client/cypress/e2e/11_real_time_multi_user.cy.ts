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

  before(() => {
    cy.apiLogin('super');
    cy.ensureUser(userB, `${userB}@example.test`, '123');
    cy.ensureGroupWithChannel(groupName, channelName);
  });

  function openChatAndSelect(gName: string, cName: string) {
    cy.visit('/chat');
    cy.selectGroupChannel(gName, cName);
  }

  it('exchanges messages between two users', () => {
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

    // Now userB is a member. Send message as A.
    cy.apiLogin('super');
    openChatAndSelect(groupName, channelName);
  cy.sendChatMessage(msgFromA);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA, { timeout: 10000 }).should('exist');

    // Switch to user B and verify A's message visible, then reply.
    cy.apiLogin(userB, '123');
    openChatAndSelect(groupName, channelName);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromA, { timeout: 10000 }).should('exist');

  cy.sendChatMessage(msgFromB);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromB, { timeout: 10000 }).should('exist');

    // Back to A to assert B's message (simulate by reauth as A)
    cy.apiLogin('super');
    openChatAndSelect(groupName, channelName);
    cy.contains('[data-cy=message-list] [data-cy^=message-] .text span', msgFromB, { timeout: 10000 }).should('exist');
  });
});
