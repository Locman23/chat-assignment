const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

let users = [
  { id: "u1", username: "super", email: "super@example.com", roles: ["Super Admin"], groups: [] }
];

app.post("/api/auth/login", (req, res) => {
  const { username, password } = req.body;
  if (username === "super" && password === "123") {
    return res.json({ user: users[0] });
  }
  res.status(401).json({ error: "Invalid username/password" });
});

const PORT = 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
