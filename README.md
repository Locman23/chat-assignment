<div align="center">

# Realtime Chat Application (Angular + Node/Express + Socket.IO + MongoDB)

</div>

## 1. Repository Organization & Workflow

Monorepo style with two principal roots:

```
root/
  client/            # Angular 20 application (standalone components)
  server/            # Express + Socket.IO backend (MongoDB persistence)
  README.md          # Project documentation
```

Key backend folders:
- `server/server.js` – bootstrap (Express app + sockets init)
- `server/sockets.js` – Socket.IO real‑time event handling
- `server/routes/` – REST API modular routers (`auth`, `users`, `groups`, `requests`, `messages`, `uploads`)
- `server/services/` – Domain logic (messageStore, presence (in-memory), typing (in-memory))
- `server/db/` – Mongo connection + seeding helpers
- `server/utils/` – cross-cutting utilities (logger, access checks, async handler, ids, etc.)

Frontend structure (selected):
- `client/src/app/app.ts` – root component / route config
- `client/src/app/chat/` – chat UI (message list, input, channel selection)
- `client/src/app/dashboard/` – user/group management & admin flows
- `client/src/app/login/` – authentication screen
- `client/src/app/profile/` – user profile & avatar upload
- `client/src/app/auth.guard.ts` – route access guard
- `client/src/app/socket.service.ts` – real-time client wrapper
- `client/src/app/api.service.ts` – REST abstraction

### Git usage
- Feature branches (e.g. `feature/Chat-Enhancements`, `QOL/CodeRefractor`) isolate changes.
- Small commits with messages describing intent + rationale.
- Periodic refactors (naming consistency, utilities, test DRYing) merged via feature branch PR.
- Cypress E2E added early to guard regression, expanded iteratively (login → CRUD → chat real‑time → pagination → attachments → join requests → multi-user).

## 2. Data Structures (Server & Client Shapes)

This section details the core persisted and in‑memory structures. All MongoDB documents are served without the internal `_id`; a stable `id` is used for client correlation.

### 2.1 Summary Table

| Entity | Stored Fields | Notes | Source of Truth |
|--------|---------------|-------|-----------------|
| User | id, username, email, password, roles[], groups[], avatarUrl? | `password` plain (dev). `roles` drive permissions. | Mongo `users` |
| Group | id, name, ownerUsername, admins[], members[], channels[] | Channels embedded as array of {id,name}. | Mongo `groups` |
| Channel | id, name | Embedded only; no standalone collection. | Group.channels |
| JoinRequest | id, gid, username, status, createdAt, processedBy?, processedAt? | Lifecycle: pending → approved/denied. | Mongo `joinRequests` |
| Message | id, groupId, channelId, username, text?, ts, avatarUrl?, attachments[] | attachments = [{ type:'image', url }]. | Mongo `messages` |
| Presence (ephemeral) | roomId → { username → sockets:Set } | Not persisted; recalculated on restart. | In-memory Map |
| Typing (ephemeral) | roomId → { username → lastActivityTs } | Entries pruned after timeout. | In-memory Map |

### 2.2 Conceptual TypeScript Interfaces
```ts
interface User { id:string; username:string; email?:string; password?:string; roles:string[]; groups:string[]; avatarUrl?:string }
interface Channel { id:string; name:string }
interface Group { id:string; name:string; ownerUsername:string; admins:string[]; members:string[]; channels:Channel[] }
interface JoinRequest { id:string; gid:string; username:string; status:'pending'|'approved'|'denied'; createdAt:number; processedBy?:string; processedAt?:number }
interface Attachment { type:'image'; url:string }
interface Message { id:string; groupId:string; channelId:string; username:string; text?:string; ts:number; avatarUrl?:string; attachments?:Attachment[] }
```

### 2.3 MongoDB Collections (Detailed Examples)

1. User
```jsonc
{
  "id": "u1",
  "username": "super",
  "email": "super@example.com",
  "password": "123",          // NOTE: plain in current phase (see Security section)
  "roles": ["Super Admin"],
  "groups": ["gAb12..."]       // group ids membership list
}
```

2. Group
```jsonc
{
  "id": "gAb12...",
  "name": "General",
  "ownerUsername": "super",
  "admins": ["super"],
  "members": ["super", "alice"],
  "channels": [ { "id": "cX9z..", "name": "general" } ]
}
```

3. Channel (embedded)
```jsonc
{ "id": "cX9z..", "name": "general" }
```

4. Join Request
```jsonc
{
  "id": "rV8k..",
  "gid": "gAb12...",
  "username": "alice",
  "status": "pending",   // pending | approved | denied
  "createdAt": 1730000000000,
  "processedBy": "super", // set when approved/denied
  "processedAt": 1730000000500
}
```

5. Message
```jsonc
{
  "id": "mbk34d-ql9abc",
  "groupId": "gAb12...",
  "channelId": "cX9z..",
  "username": "alice",
  "text": "Hello world",
  "ts": 1730001112222,
  "avatarUrl": "/uploads/abc.png",      // relative (absolute composed at emit)
  "attachments": [ { "type": "image", "url": "/uploads/img.png" } ] // optional
}
```

### 2.4 In‑Memory (Ephemeral) Structures
- Presence: `Map<roomId, Map<usernameLower, { username, sockets:Set<socketId> }>>`
- Typing: `Map<roomId, Map<username, lastTypingActivityTs>>` (stale entries auto-pruned)

### 2.5 Client Mirrors
Angular uses lightweight object literals matching these shapes (no dedicated model classes required at this phase). Data arrives via `ApiService` (REST) and `SocketService` (real-time) and lives in component state.

## 3. Responsibility Split: Client vs Server

| Concern | Client (Angular) | Server (Express + Socket.IO) |
|---------|------------------|------------------------------|
| Auth (login) | Sends credentials, stores returned user in localStorage | Validates user/password (current: plain), returns user JSON |
| Authorization | Hides/disables UI actions based on roles | Enforces roles & ownership (requester checks) |
| Group/Channel CRUD | Initiates REST calls & refreshes local lists | Persists groups & channels; validates role permissions |
| Join Requests | Create request, poll/list (Super) | Stores request; approval mutates membership & emits roster updates |
| Chat messages | Emits via Socket.IO; renders new messages & history; handles pagination | Persists message (normalize attachments), broadcasts to room, system messages on joins/leaves |
| Presence/Typing | Shows presence lists & typing indicators | Maintains ephemeral presence + typing state; emits updates |
| Avatars / Uploads | Submits multipart forms; refreshes profile/chat avatar displays | Handles file storage & relative path persistence; returns absolute URL |
| Message History | Requests pages via REST `/api/messages/...` | Queries Mongo with limit + beforeTs; computes hasMore |

## 4. REST API Routes

Base: `http://localhost:3000/api`

### 4.1 Tabular Reference

| Method | Path | Body / Query Params | Success Response | Purpose |
|--------|------|---------------------|------------------|---------|
| POST | /auth/login | { username, password } | { user } | Authenticate user |
| GET | /users | – | { users } | List users |
| POST | /users | { username, email?, password? } | { user } (201) | Create user |
| PUT | /users/:id/role | { role, requester } | { user } | Change role |
| PUT | /users/:id | { username?, email?, password?, requester } | { user } | Update profile |
| DELETE | /users/:id | { requester } | { success:true } | Delete user |
| GET | /groups | – | { groups } | List groups |
| POST | /groups | { name, ownerUsername } | { group } (201) | Create group |
| GET | /groups/:gid | – | Group doc | Group detail |
| DELETE | /groups/:gid | { requester } | { success:true } | Delete group |
| POST | /groups/:gid/members | { username, requester } | { members } (201) | Add member |
| DELETE | /groups/:gid/members | { username, requester } | { members } | Remove member |
| POST | /groups/:gid/channels | { name, requester } | { channel } (201) | Create channel |
| GET | /groups/:gid/channels | – | { channels } | List channels |
| POST | /groups/:gid/admins | { username, requester } | { admins } (201) | Add group admin |
| DELETE | /groups/:gid/admins | { username, requester } | { admins } | Remove group admin |
| POST | /groups/:gid/requests | { username } | { request } (201) | Create join request |
| GET | /requests?requester=super | requester (query) | { requests } | List join requests (Super) |
| PUT | /requests/:rid/approve | { requester } | { request, members } | Approve join |
| PUT | /requests/:rid/deny | { requester } | { request } | Deny join |
| GET | /messages/:groupId/:channelId | query: user, limit, beforeTs | { messages, hasMore } | Paginate history |
| POST | /uploads/avatar | multipart avatar + requester | { ok, user, avatarUrl } | Upload avatar |
| POST | /uploads/message-image | multipart image + { username, groupId, channelId } | { ok, url } | Upload message image |
| GET | /health | – | { ok, uptimeSec, ... } | Health info |
| GET | /ping | – | pong | Liveness check |

### 4.2 Notes
- Standard HTTP codes: 200/201 success; 400 invalid input; 401/403 auth/permission; 404 not found; 409 conflict.
- Pagination for messages uses `limit` (default server-side) and `beforeTs` for backward paging.
- `requester` field is required on mutating endpoints for authorization validation.

## 5. Real-Time Socket.IO Events

Room naming convention: `roomId = <groupId>:<channelId>` ensures isolation per channel.

### 5.1 Event Reference

| Direction | Event | Payload (Emit) | Ack / Server Response | Description |
|-----------|-------|----------------|-----------------------|-------------|
| C → S | chat:join | { username, groupId, channelId } | { ok, history, roster } | Join room; returns recent history + roster |
| C → S | chat:leave | { groupId, channelId? } | { ok } | Leave current room |
| C → S | chat:message | { text?, imageUrl?, attachments? } | { ok, message } | Persist & broadcast message (system if generated) |
| C → S | chat:typing | { isTyping:boolean } | { ok } | Update user's typing state |
| C → S | chat:roster:request | {} | { ok, roster } | Force roster rebuild/return |
| S → C | chat:message | { message } | – | New user/system message |
| S → C | chat:presence | { users } | – | Presence snapshot after join/leave |
| S → C | chat:typing | { users } | – | Active typing users |
| S → C | chat:roster | { roster } | – | Membership roster w/ avatar URLs |

### 5.2 System Messages
Server generates and persists join/leave events as messages with `username = "system"`, allowing consistent rendering & pagination.

### 5.3 Reliability Considerations
- Client re-fetches history via REST on reconnect if needed; socket join ack also supplies history slice.
- Presence & typing are ephemeral; stale typing entries are auto-pruned server-side.

## 6. Angular Architecture

### 6.1 Layer Overview

| Layer | Items | Responsibilities | Key Files |
|-------|-------|------------------|-----------|
| Components (Pages) | App, Login, Dashboard, Chat, Profile | UI composition, user interaction, subscribe to services | `app.ts`, feature folders |
| (Future) Subcomponents | message-list, message-input | Encapsulate chat UI pieces | (planned) |
| Services | ApiService, AuthService, SocketService, StorageService | REST, auth/session, real-time orchestration, storage wrapper | `api.service.ts`, `auth.service.ts`, `socket.service.ts`, `storage.service.ts` |
| Pipes | group-filter, user-filter | Lightweight list filtering in templates | `dashboard/*.pipe.ts` |
| Guard | AuthGuard | Route access control | `auth.guard.ts` |
| Styles | Global + feature SCSS | Consistent styling & theming | `styles.scss`, `app.scss` |

### 6.2 Component Roles
- App: Shell layout + router outlet.
- Login: Auth form → ApiService.login → AuthService persist.
- Dashboard: User/group/channel CRUD + join request moderation; role-gated UI actions.
- Chat: Room join, message stream, pagination (history REST), presence & typing indicators, attachments.
- Profile: User attribute edits + avatar upload.

### 6.3 Services Interaction Diagram
```
ApiService  <---- HTTP ---->  Express Routes
SocketService <--- WebSocket ---> Socket.IO (events)
AuthService  -> localStorage (auth_user)
```

### 6.4 State Handling
- Stateless global store; components own ephemeral state.
- Chat maintains per-room message arrays; `beforeTs` used for historical pagination.
- SocketService (conceptually) exposes Observables/Subjects for messages, presence, typing (implementation may be incremental).

### 6.5 Styling & Testing Aids
- SCSS modular approach; shared tokens in `app.scss`.
- `data-cy` selectors on interactive elements guarantee stable E2E targeting.

## 7. Client ↔ Server Interaction Flows

| User Action | REST / Socket Calls | Server State Mutation | UI Update Mechanism |
|-------------|--------------------|-----------------------|---------------------|
| Login | POST `/auth/login` | None (read) | Store user → route to dashboard/chat |
| Create User | POST `/users` | Insert user document | Refresh users list (ApiService) |
| Promote User | PUT `/users/:id/role` | Update user.roles; possibly remove from group admins if demoted | Optimistic update + refetch |
| Create Group | POST `/groups` then POST channel | Insert group + initial channel | Push to groups list and select |
| Request Join | POST `/groups/:gid/requests` | Insert joinRequest doc | Show pending (Super dashboard) |
| Approve Join | PUT `/requests/:rid/approve` | Update request, add member → group.members + user.groups | Roster refresh broadcast + UI refetch |
| Open Channel | GET groups/channels (if not cached), Socket `chat:join` | Presence add, system join message, build roster | History + roster render, presence list update |
| Send Message | Socket `chat:message` | Save message; broadcast; typing cleared | Append message (stream subscribe) |
| Load Older | GET `/messages/... ?beforeTs` | None | Prepend older messages |
| Typing | Socket `chat:typing` | In-memory typing map | Typing indicator list refresh |
| Avatar Upload | POST `/uploads/avatar` | Update user.avatarUrl | Profile & chat message avatars update (roster + message emit) |
| Leave Channel / Disconnect | Socket `chat:leave` / disconnect | Presence removal, system leave message | Remove from presence list & show system message |

### 7.1 REST & Socket Interoperation
- REST establishes authenticated context, CRUD operations, history pagination, and file/asset handling.
- Sockets deliver high-frequency, state-delta events: messages, presence, typing, roster changes.
- On channel switch: (1) ensure group/channel lists via REST, (2) issue `chat:join` to populate recent history + roster instantly, (3) request older messages via REST if user scrolls up.

### 7.2 Trace Example (Send Message)
1. User presses send in Chat component.
2. `SocketService` emits `chat:message` with trimmed text.
3. Server validates membership + content, persists message with generated id & timestamp.
4. Server broadcasts `chat:message` to room (including sender).
5. Chat component appends message; if user is viewing older history, future enhancement could mark unread.

## 8. Testing Strategy

### End-to-End (Cypress)
Specs cover:
- Authentication & guard redirects
- User management (create, role change, delete guard conditions)
- Group + channel creation
- Chat basics (single message, ordering, multi-message burst)
- Empty message prevention (trim check)
- Image attachment upload + message render
- History pagination with `hasMore` logic
- Real-time multi-user bidirectional exchange (extended with typing & ordering)
- Join request workflow (request → approve → membership)

Custom Cypress Commands:
- `apiLogin`, `ensureUser`, `ensureGroupWithChannel`
- Join request helpers: `requestJoin`, `listJoinRequests`, `approveJoinRequest`
- UI helpers: `selectGroupChannel`, `sendChatMessage`
- Cleanup helpers: `cleanupTestData`, `deleteUser`, `deleteGroup`

Global `afterEach` runs `cleanupTestData` (prefix-based) to keep DB lean.

### Unit / Service (Planned)
- Future additions: isolate SocketService, ApiService with mocked HTTP / socket layers.

## 9. Configuration & Environment

Environment variables used (backend):
- `PORT` (default 3000)
- `PUBLIC_BASE` (default `http://localhost:3000`) – used to construct absolute URLs for avatars/attachments
- `MONGODB_URI` (default `mongodb://127.0.0.1:27017`)
- `MONGODB_DB` (default `chatapp`)
- `LOG_LEVEL` (debug|info|warn|error; default debug)

## 10. Running the Project

Backend:
```powershell
cd server
npm install
npm start        # node server.js (or npm run dev with nodemon if configured)
```

Frontend:
```powershell
cd client
npm install
npm start        # Angular dev server at http://localhost:4200
```

E2E (headless):
```powershell
cd client
npx cypress run
```
Or open interactive runner:
```powershell
npx cypress open
```

## 11. Security & Future Hardening

| Area | Current | Planned Improvement |
|------|---------|--------------------|
| Passwords | Plain text (development seed) | Bcrypt hashing + migration (in progress design) |
| Auth Tokens | None (session stored user) | JWT or session cookie + CSRF protection |
| Rate Limiting | Not enforced | Add express-rate-limit on auth & mutation endpoints |
| Input Validation | Manual field checks | Central schema validation (Zod / Joi) |
| File Uploads | MIME filter + size limit | Virus scan / content-type revalidation |
| Logging | Console with leveled logger | Structured & external sink (e.g. pino + ELK) |

## 12. Notes on Server Internal Mutations

Global (module) mutable references:
- Presence & typing maps grow and shrink on join/leave and typing expiry.
- Roster builds are stateless; enrichment queries user collection for avatar.
- System messages share same persistence path as user messages for uniform history.

## 13. Glossary
- **Roster**: List of group members + derived status (active / online / offline).
- **Room**: Composite of group + channel forming a logical Socket.IO room.
- **System Message**: Server-originated message describing joins/leaves.

## 14. Quick Development Checklist
- [x] Core CRUD (users, groups, channels)
- [x] Join requests (approval workflow)
- [x] Real-time messaging (Socket.IO)
- [x] Pagination & ordering
- [x] Attachments & avatar uploads
- [x] Presence + typing indicators
- [x] Comprehensive Cypress coverage
- [ ] Password hashing rollout
- [ ] Backend unit tests
- [ ] Global error middleware & validation layer

