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

### MongoDB Collections
All persisted documents omit internal `_id` when served to the client (custom `id` fields used for correlation).

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

### In‑Memory (Ephemeral) Structures
- Presence: `Map<roomId, Map<usernameLower, { username, sockets:Set<socketId> }>>`
- Typing: `Map<roomId, Map<username, lastTypingActivityTs>>` (stale entries auto-pruned)

### Client Mirrors
The Angular app uses plain TypeScript object literals mirroring server JSON (no heavy model layer). Data flows via `ApiService` and is cached short‑term in component state.

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

### Auth
- `POST /auth/login` — body `{ username, password }` → `{ user }`, 401 on failure.

### Users
- `GET /users` → `{ users: [...] }`
- `POST /users` body `{ username, email?, password? }` → `201 { user }` (409 if taken)
- `PUT /users/:id/role` body `{ role, requester }` → `{ user }`
- `PUT /users/:id` body `{ username?, email?, password?, requester }` → `{ user }`
- `DELETE /users/:id` body `{ requester }` → `{ success: true }`

### Groups & Channels
- `GET /groups` → `{ groups: [...] }`
- `POST /groups` body `{ name, ownerUsername }` → `201 { group }`
- `GET /groups/:gid` → group summary
- `DELETE /groups/:gid` body `{ requester }` → `{ success: true }`
- `POST /groups/:gid/members` body `{ username, requester }` → `201 { members }`
- `DELETE /groups/:gid/members` body `{ username, requester }` → `{ members }`
- `POST /groups/:gid/channels` body `{ name, requester }` → `201 { channel }`
- `GET /groups/:gid/channels` → `{ channels }`
- `POST /groups/:gid/admins` body `{ username, requester }` → `201 { admins }`
- `DELETE /groups/:gid/admins` body `{ username, requester }` → `{ admins }`

### Join Requests
- `POST /groups/:gid/requests` body `{ username }` → `201 { request }`
- `GET /requests?requester=super` (Super only) → `{ requests }`
- `PUT /requests/:rid/approve` body `{ requester }` → `{ request, members }`
- `PUT /requests/:rid/deny` body `{ requester }` → `{ request }`

### Messages (History Pagination)
- `GET /messages/:groupId/:channelId?user=<u>&limit=<n>&beforeTs=<epoch>`
  - Returns `{ messages:[...], hasMore: boolean }`
  - Sorted ascending client-side; server queries descending & slices.

### Uploads
- `POST /uploads/avatar` multipart field `avatar`, body `requester` → `{ ok, user, avatarUrl }`
- `POST /uploads/message-image` multipart field `image`, body `{ username, groupId, channelId }` → `{ ok, url }`

### Health & Utility
- `GET /health` → `{ ok, uptimeSec, userCount?, groupCount?, joinRequestCount? }`
- `GET /ping` → `pong` (text)

## 5. Real-Time Socket.IO Events

Room naming: `roomId = <groupId>:<channelId>`

Client -> Server:
- `chat:join` `{ username, groupId, channelId }` ack `{ ok, history, roster }`
- `chat:leave` ack `{ ok }`
- `chat:message` `{ text?, imageUrl?, attachments? }` ack `{ ok, message }`
- `chat:typing` `{ isTyping: boolean }` ack `{ ok }`
- `chat:roster:request` ack `{ ok, roster }`

Server -> Client (broadcast/system):
- `chat:message` (user + system messages)
- `chat:presence` `{ users:[...] }` (active presence snapshot)
- `chat:typing` `{ users:[...] }`
- `chat:roster` `{ roster:[{ username,status,avatarUrl? }] }`

System messages are persisted like normal messages (username=`system`).

## 6. Angular Architecture

### Components
- **App**: root shell; registers routes, layout.
- **Login**: credential form; on success stores user in localStorage.
- **Dashboard**: CRUD for users, groups, channels, join request moderation.
- **Chat**: group/channel sidebar, message list, pagination “load older”, typing & presence indicators, image attachment support.
- **Profile**: edit username/email/password (where allowed) + avatar upload.

### Services
- **ApiService**: REST calls mapping to routes above.
- **AuthService**: localStorage session management, role helpers.
- **SocketService**: wraps Socket.IO client (connect, join, leave, send, typing, reactive message stream).
- **StorageService**: simple wrapper (legacy/backward compatibility).

### Pipes
- `group-filter`, `user-filter` – local filtering in dashboard lists.

### Routing & Guard
- Auth guard prevents navigation to protected routes if no stored user.

### Styling / UX
- SCSS modules per feature; shared styles in `app.scss` & root `styles.scss`.
- `data-cy` attributes across interactive elements for deterministic Cypress selection.

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

---
