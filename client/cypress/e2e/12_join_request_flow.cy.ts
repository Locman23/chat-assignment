// @ts-nocheck
/// <reference types="cypress" />

// Join request workflow test: user requests to join, super admin sees and approves, membership reflected.

describe('Join Request Flow', () => {
  const unique = Date.now();
  const groupName = `JR_${unique}`;
  const channelName = `chan_${unique}`;
  const requesterUser = `joiner_${unique}`;

  before(() => {
    cy.apiLogin('super');
    cy.ensureGroupWithChannel(groupName, channelName);
    cy.ensureUser(requesterUser, `${requesterUser}@example.test`, '123');
  });

  it('creates and approves a join request', () => {
    // user requests to join group
    cy.apiLogin(requesterUser, '123');
    cy.request('GET', 'http://localhost:3000/api/groups').then(res => {
      const g = res.body.groups.find(g => g.name === groupName);
      expect(g, 'group exists').to.exist;
      const gid = g.id;
      cy.request('POST', `http://localhost:3000/api/groups/${gid}/requests`, { username: requesterUser })
        .then(() => {
          cy.apiLogin('super');
          cy.request(`http://localhost:3000/api/requests?requester=super`).then(list => {
            const pending = list.body.requests.find(r => r.username === requesterUser && r.gid === gid);
            expect(pending, 'pending request exists').to.exist;
            cy.request('PUT', `http://localhost:3000/api/requests/${pending.id}/approve`, { requester: 'super' });
          });
        })
        .then(() => {
          cy.apiLogin(requesterUser, '123');
          cy.visit('/chat');
          cy.get('[data-cy=group-list]', { timeout: 10000 })
            .contains('.group-item .group-name', groupName, { timeout: 10000 })
            .should('exist');
        });
    });
  });
});
