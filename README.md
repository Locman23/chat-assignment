# Chat Assignment — Phase 1

This repository contains a minimal chat management prototype:
- Node.js/Express server with simple JSON persistence (server/data.json).
- Angular frontend (client/) that talks to the server via a REST API.
- In-memory data structures persisted to `server/data.json` after each change.

This README documents repository layout, design / version-control approach, main data structures, REST routes and expected behaviour, and the Angular architecture.
---

## Repository layout

Top-level folders:
- `/server` — Node/Express API
  - `server.js` — main server implementation (endpoints and persistence)
  - `data.json` — runtime JSON store (created / updated by server)
- `/client` — Angular application
  - `src/app` — components, pages and services (see Angular section)
  - `styles.scss` / `app.scss` — global styles and theme
- `README.md` — this file

GitHub Version control approach
- Use feature branches for each task (e.g., `feature/api-auth`, `fix/groups`)
- Make small, focused commits with descriptive messages (what + why)
- Merge to `dev` first to perform verification and testing, before merging with `main`
- Tag releases for milestones (e.g., `v1-Structure`)

---

## Main data structures

All data is held in-memory and saved to `server/data.json` after each mutation

1. User
```json
{
  "id": "u1598471234567",
  "username": "alice",
  "email": "alice@example.com",
  "password": "plain-or-hashed",    // Phase-1 stores plain text; consider hashing for production
  "roles": ["User"],                // e.g. ["User"], ["Group Admin"], ["Super Admin"]
  "groups": ["g159847..."]          // array of group IDs the user belongs to
}
```

2. Group
```json
{
  "id": "g1598471234567",
  "name": "Group Name",
  "ownerUsername": "owner_username",
  "admins": ["owner_username", "bob"],
  "members": ["owner_username","alice"],
  "channels": [ { "id":"c159...", "name":"general" }, ... ]
}
```

3. Channel
- Represented inside a group as `{ id, name }`. Channels are scoped to a group

4. Join Request
```json
{
  "id": "r1598471234567",
  "gid": "g1598471234567",
  "username": "requesting_user",
  "status": "pending",          // pending | approved | denied
  "createdAt": 1598471234567,
  "processedBy": "super",       // added when processed
  "processedAt": 1598471239999
}
```

Persistence
- `saveData()` writes `{ users, groups, joinRequests }` to `server/data.json` using atomic write/rename pattern
- `loadData()` restores and normalises structures at server start

---

## REST API (server routes)

All routes are under `/api`. JSON is used for request bodies and responses

Authentication (login)
- POST /api/auth/login
  - Body: `{ username, password }`
  - Returns: `{ user }` on success or 401
  - Notes: Phase-1 uses a simple password check. `super` has default password `123` if no password stored

Users
- GET /api/users
  - Returns: `{ users: [ ... ] }`
- POST /api/users
  - Body: `{ username, email?, password? }`
  - Creates a new user with role `User`.
  - Returns: `201 { user }` or `409` (username taken)
- PUT /api/users/:id/role
  - Body: `{ role, requester }`
  - Change a user's role. `role` must be one of `Super Admin`, `Group Admin`, `User`.
  - Authorization:
    - Promoting to `Group Admin` or `Super Admin` requires requester to be `Super Admin`.
    - Only `Super Admin` may assign/demote elevated roles
  - Returns: `{ user }`
- PUT /api/users/:id
  - Body: `{ username?, email?, password?, requester }`
  - Self-edit profile only (requester must match target user)
  - Username uniqueness enforced (case-insensitive)
  - Password is updated only when non-empty value provided
  - Returns: `{ user }`
- DELETE /api/users/:id
  - Body: `{ requester }`
  - Only `Super Admin` or the user themself may delete a user
  - Removes the user from all groups and admins lists
  - Returns: `{ success: true }`

Groups & Channels
- GET /api/groups
  - Returns all groups: `{ groups: [...] }`
  - (Client-side shows which groups a user can request to join)
- POST /api/groups
  - Body: `{ name, ownerUsername }`
  - Only `Group Admin` or `Super Admin` may create groups (ownerUsername must be an eligible user)
  - Returns: `201 { group }`
- GET /api/groups/:gid
  - Returns: `{ id, name, ownerUsername, members, channels }`
- DELETE /api/groups/:gid
  - Body: `{ requester }`
  - Only group owner or `Super Admin` may delete group. Removes group id from users' groups arrays
  - Returns: `{ success: true }`

- POST /api/groups/:gid/members
  - Body: `{ username, requester }`
  - Add a member to a group (owner, group admin for that group, or `Super Admin`).
  - Returns: `201 { members: [...] }`
- DELETE /api/groups/:gid/members
  - Body: `{ username, requester }`
  - Remove a member from a group (owner, group admin for that group, or `Super Admin`).
  - Returns: `{ members: [...] }`

- POST /api/groups/:gid/channels
  - Body: `{ name, requester }`
  - Create a channel in a group (owner, group admin for that group, or `Super Admin`).
  - Returns: `201 { channel }`
- GET /api/groups/:gid/channels
  - Returns: `{ channels: [...] }`

Group admin management
- POST /api/groups/:gid/admins
  - Body: `{ username, requester }`
  - Adds user to the group's `admins` array. Target user must already have `Group Admin` role (promoted by Super Admin)
  - Only group owner or Super may add admins
  - Returns: `201 { admins: [...] }`
- DELETE /api/groups/:gid/admins
  - Body: `{ username, requester }`
  - Remove an admin from the group. Only group owner or Super may remove admins
  - Returns: `{ admins: [...] }`

Join requests (user-initiated / Super-approved)
- POST /api/groups/:gid/requests
  - Body: `{ username }`
  - Create a join request for the specified group (user-visible list shows groups they can request)
  - Returns: `201 { request }`
- GET /api/requests
  - Query: `?requester=<username>`
  - Only `Super Admin` may list pending requests; returns `{ requests: [...] }`
- PUT /api/requests/:rid/approve
  - Body: `{ requester }` (must be Super)
  - Approve request: add user to group members, update request status
  - Returns: `{ request, members }`
- PUT /api/requests/:rid/deny
  - Body: `{ requester }` (must be Super)
  - Deny request: update status to `denied`.
  - Returns: `{ request }`

Notes about authorization
- Many endpoints expect a `requester` field in the request body (or query for GET /api/requests) so the server can enforce role/ownership checks
- Responses use conventional HTTP status codes: `200` / `201` for success, `400` for bad input, `401/403` for auth/permission issues, `404` when resource not found, `409` for conflicts

---

## Angular frontend architecture

High-level
- The frontend is an Angular application that communicates with the Node server via the REST API above

Main pieces
- Components (pages)
  - `App` — top-level shell (header, navigation, router outlet)
  - `Login` — authentication page
  - `Dashboard` — unified admin/control UI for users, groups, channels and pending join-requests. Contains sub-sections for Users and Groups
  - `Chat` — read-only chat page template listing groups and channels
  - `Profile` — user profile page (edit username, email, password)
- Services
  - `ApiService` (`client/src/app/api.service.ts`) — central HTTP wrapper with methods matching server endpoints:
    - login(), getUsers(), addUser(), changeUserRole(), updateUserProfile(), deleteUser(), getGroups(), addGroup(), deleteGroup(), addGroupMember(), removeGroupMember(), addAdminToGroup(), removeAdminFromGroup(), getChannels(), addChannel(), requestJoinGroup(), listJoinRequests(), approveRequest(), denyRequest(), etc.
  - `AuthService` (`client/src/app/auth.service.ts`) — manages auth state (stores `auth_user` in localStorage), helper methods `isSuper()`, `isGroupAdmin()`, `username()`, logout()
  - `StorageService` — lightweight wrapper over localStorage (used earlier in development)
- Models / Shapes (informal)
  - Client code uses plain JS objects matching the server data structures: `User`, `Group`, `Channel`, `JoinRequest`. No formal Typescript model files are required for this phase, but shapes are consistent across API and client usage

Client behaviour highlights
- Optimistic UI updates were implemented for create and membership operations to improve UX; server state is persisted and re-synced after operations
- Permission gating: UI shows/hides or disables actions depending on role checks from `AuthService`. The server enforces permissions as the ultimate check
- Styles: common utilities (cards, buttons, inputs) are defined in `app.scss` and reused across components

---

## Running the project (development)

1. Server
```powershell
cd server
npm install
npm run dev   # uses nodemon or `node server.js`
# Server listens on http://localhost:3000
```

2. Client
```powershell
cd client
npm install
npm start     # starts Angular dev server (default http://localhost:4200)
```

Start server before the client for persistence and endpoint availability.

---
