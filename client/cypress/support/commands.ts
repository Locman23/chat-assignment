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
			cleanupTestData(options?: { users?: string[]; groups?: string[]; prefixUsers?: string; prefixGroups?: string }): Chainable<void>;
			deleteUser(username: string): Chainable<void>;
			deleteGroup(groupId: string): Chainable<void>;
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

// Admin-only destructive helpers (intended for test cleanup). Assumes caller is logged in as super.
Cypress.Commands.add('deleteUser', (username: string) => {
	if (!username) return;
	cy.request({
		method: 'DELETE',
		url: `${API_BASE}/users/placeholder`, // placeholder to preserve shape; real deletion via username lookup below
		failOnStatusCode: false,
		body: { requester: 'super' }
	}).then(() => {
		// Direct delete endpoint uses id; need lookup by listing users.
		cy.request('GET', `${API_BASE}/users`).then(res => {
			const user = (res.body as any).users.find((u: any) => u.username === username);
			if (user) {
				cy.request({
					method: 'DELETE',
					url: `${API_BASE}/users/${user.id}`,
					body: { requester: 'super' },
					failOnStatusCode: false
				});
			}
		});
	});
});

Cypress.Commands.add('deleteGroup', (groupId: string) => {
	if (!groupId) return;
	cy.request({
		method: 'DELETE',
		url: `${API_BASE}/groups/${groupId}`,
		body: { requester: 'super' },
		failOnStatusCode: false
	});
});

// Bulk cleanup: specify exact lists or prefixes (prefix match on names for automation-created artifacts)
Cypress.Commands.add('cleanupTestData', (options = {}) => {
	const { users = [], groups = [], prefixUsers, prefixGroups } = options;
	// Fetch current state once for users & groups
	cy.apiLogin('super');
	cy.request('GET', `${API_BASE}/users`).then(userRes => {
		const allUsers: any[] = (userRes.body as any).users || [];
		const targetUsers = new Set<string>();
		users.forEach(u => targetUsers.add(u));
		if (prefixUsers) {
			allUsers.filter(u => u.username?.startsWith(prefixUsers)).forEach(u => targetUsers.add(u.username));
		}
		// Never delete the seeded super
		targetUsers.delete('super');
		if (targetUsers.size) {
			cy.wrap(Array.from(targetUsers)).each((uname: string) => {
				cy.deleteUser(uname);
			});
		}
	});
	cy.request('GET', `${API_BASE}/groups`).then(groupRes => {
		const allGroups: any[] = (groupRes.body as any).groups || [];
		const targetGroups: string[] = [];
		allGroups.forEach(g => {
			if (groups.includes(g.name)) targetGroups.push(g.id);
			else if (prefixGroups && g.name?.startsWith(prefixGroups)) targetGroups.push(g.id);
		});
		// Avoid deleting the very first seeded general group if business logic relies on it
		for (const gid of targetGroups) {
			cy.deleteGroup(gid);
		}
	});
});

export {};
