const express = require("express");
const app = express();
const PORT = 3000;

app.get("/", (req, res) => {
  res.json({ message: "Hello from Node.js API!", status: "running" });
});

app.get("/health", (req, res) => {
  res.json({ status: "healthy" });
});

app.get("/api/data", (req, res) => {
  res.json({
    items: [
      { id: 1, name: "Node Item 1" },
      { id: 2, name: "Node Item 2" },
      { id: 3, name: "Node Item 3" },
    ],
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Node API running on http://0.0.0.0:${PORT}`);
});
