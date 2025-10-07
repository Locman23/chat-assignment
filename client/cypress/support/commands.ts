// ***********************************************
// This example namespace declaration will help
// with Intellisense and code completion in your
// IDE or Text Editor.
// ***********************************************
// declare namespace Cypress {
//   interface Chainable<Subject = any> {
//     customCommand(param: any): typeof customCommand;
//   }
// }
//
// function customCommand(param: any): void {
//   console.warn(param);
// }
//
// NOTE: You can use it like so:
// Cypress.Commands.add('customCommand', customCommand);
//
// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })
//
//
// Add custom commands for API login and ensuring a user exists
// NOTE: Adjust endpoint paths if backend changes.
// Typescript declaration merging for IntelliSense
declare global {
	namespace Cypress {
		interface Chainable {
			apiLogin(username: string, password?: string): Chainable<void>;
			ensureUser(username: string, email?: string, password?: string): Chainable<void>;
				ensureGroupWithChannel(groupName: string, channelName: string, ownerUsername?: string): Chainable<{ groupId: string; channelId: string }>;
			requestJoin(groupId: string, username: string): Chainable<{ requestId: string }>;
			listJoinRequests(requester: string): Chainable<any[]>;
			approveJoinRequest(requestId: string, requester: string): Chainable<void>;
			selectGroupChannel(groupName: string, channelName: string): Chainable<void>;
			sendChatMessage(text: string): Chainable<void>;
		}
	}
}

const API_BASE = 'http://localhost:3000/api';

Cypress.Commands.add('apiLogin', (username: string, password: string = '123') => {
	cy.request('POST', `${API_BASE}/auth/login`, { username, password }).then(res => {
		expect(res.status).to.eq(200);
		const user = (res.body as any).user;
		window.localStorage.setItem('auth_user', JSON.stringify(user));
	});
});

Cypress.Commands.add('ensureUser', (username: string, email?: string, password: string = '123') => {
	// Assumes caller is already logged in as super admin.
	cy.request({
		method: 'POST',
		url: `${API_BASE}/users`,
		failOnStatusCode: false,
		body: { username, email: email || `${username}@example.test`, password }
	}).then(res => {
		if (![200,201].includes(res.status) && res.status !== 409) {
			// 409 could be duplicate depending on server design; treat as ok to proceed.
			throw new Error('ensureUser failed with status ' + res.status);
		}
	});
});

	Cypress.Commands.add('ensureGroupWithChannel', (groupName: string, channelName: string, ownerUsername: string = 'super') => {
		// Create group
		return cy.request<{ group: { id: string } }>({
			method: 'POST',
			url: `${API_BASE}/groups`,
			body: { name: groupName, ownerUsername },
			failOnStatusCode: false
		}).then(groupRes => {
			if (![200,201].includes(groupRes.status)) {
				throw new Error('Failed to create group: ' + groupRes.status + ' ' + JSON.stringify(groupRes.body));
			}
			const gid = groupRes.body.group.id;
			// Create channel
			return cy.request<{ channel: { id: string } }>({
				method: 'POST',
				url: `${API_BASE}/groups/${gid}/channels`,
				body: { name: channelName, requester: ownerUsername },
				failOnStatusCode: false
			}).then(chanRes => {
				if (![200,201].includes(chanRes.status)) {
					throw new Error('Failed to create channel: ' + chanRes.status + ' ' + JSON.stringify(chanRes.body));
				}
				return { groupId: gid, channelId: chanRes.body.channel.id };
			});
		});
	});

// Join request helpers
Cypress.Commands.add('requestJoin', (groupId: string, username: string) => {
	return cy.request<{ request: { id: string } }>({
		method: 'POST',
		url: `${API_BASE}/groups/${groupId}/requests`,
		body: { username },
		failOnStatusCode: false
	}).then(res => {
		if (![200,201].includes(res.status)) throw new Error('Failed to create join request: ' + res.status);
		return { requestId: res.body.request.id };
	});
});

Cypress.Commands.add('listJoinRequests', (requester: string) => {
	return cy.request<{ requests: any[] }>({
		method: 'GET',
		url: `${API_BASE}/requests?requester=${encodeURIComponent(requester)}`,
		failOnStatusCode: false
	}).then(res => {
		if (res.status !== 200) throw new Error('Failed to list join requests: ' + res.status);
		return cy.wrap(res.body.requests, { log: false });
	});
});

Cypress.Commands.add('approveJoinRequest', (requestId: string, requester: string) => {
	cy.request({
		method: 'PUT',
		url: `${API_BASE}/requests/${requestId}/approve`,
		body: { requester },
		failOnStatusCode: false
	}).then(res => {
		if (res.status !== 200) throw new Error('Failed to approve request: ' + res.status);
	});
});

// UI helpers
Cypress.Commands.add('selectGroupChannel', (groupName: string, channelName: string) => {
	cy.get('[data-cy=group-list]', { timeout: 10000 }).within(() => {
		cy.contains('.group-item .group-name', groupName, { timeout: 10000 })
			.parents('.group-item')
			.find('button.group-btn')
			.first()
			.click();
	});
	cy.contains('[data-cy^=channel-item-]', channelName, { timeout: 10000 }).click();
});

Cypress.Commands.add('sendChatMessage', (text: string) => {
	cy.get('[data-cy=chat-input]').clear().type(text);
	cy.get('[data-cy=chat-send]').click();
});

export {};
