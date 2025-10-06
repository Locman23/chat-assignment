# Chat Component Dev Notes

This file documents internal architectural notes added during the polish pass.

## Logging
Client debug logs are gated by setting in browser console:
```
localStorage.setItem('debug','1'); // enable
localStorage.removeItem('debug');   // disable
```

Server logging goes through `server/utils/logger.js`. Enable verbose debug with environment variable:
```
DEBUG=1 node server.js
```

## Pagination
- Initial socket join returns last 50 (chronological ascending after reversal in service).
- Older pages fetched via REST `GET /api/messages/:group/:channel?beforeTs=<oldest>&limit=50&user=<username>`.
- Server uses a limit+1 fetch to set `hasMore` truthfully.
- Scroll anchoring: previous scrollHeight is subtracted to keep the top message stable.

## Roster & Presence
- Presence is per-room; roster derives statuses per group member: active (in room), online (in other room), offline (nowhere).
- Roster pushes: on join/leave/disconnect and explicit client request.

## Typing Indicators
- In-memory map with 5s timeout (server/services/typing.js). Client idle threshold 2s.

## Future Ideas
- Migrate presence & typing to Redis for multi-instance scaling.
- Add message search index (text + group/channel compound).
- Replace password storage with hashing + JWT auth.
- Add message reactions & edit/delete with soft-deletes.
