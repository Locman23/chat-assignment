const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ---- In-memory data (Phase 1 only) ----
let users = [
  { id: "u1", username: "super", email: "super@example.com", roles: ["Super Admin"], groups: [] },
  // Add more users if needed
];

const ok = (res, data) => res.json(data);
const bad = (res, code, msg) => res.status(code).json({ error: msg });

// ---- Auth: POST /api/auth/login ----
app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body || {};

  // Required: super/123 for Super Admin
  if (username === "super" && password === "123") {
    const user = users.find(u => u.username === "super");
    return ok(res, { user });
  }

  // Any other username must exist, password just non-empty for Phase 1
  const user = users.find(u => u.username === username);
  if (!user || !password) return bad(res, 401, "Invalid username or password");

  return ok(res, { user });
});

// ---- Example test route ----
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "Server is running" });
});

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
