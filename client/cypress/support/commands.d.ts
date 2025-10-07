// Type declarations for custom Cypress commands
/// <reference types="cypress" />

declare namespace Cypress {
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

export {};