const express = require("express");
const cors = require("cors");
const http = require("http");
const route = require("./src/routes.js");
const authRoutes = require("./src/modules/auth");

const app = express();

// ✅ Middleware parsing JSON
app.use(express.json());

// ✅ Auth route tanpa prefix /api
app.use("/auth", authRoutes);

// ✅ Routes utama
app.use("/api", route);

// ✅ Handling 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    data: null,
  });
});

// ✅ Jalankan server
const port = process.env.PORT || 5000;
const server = http.createServer(app);

server.listen(port, () => {
  console.log(`⚡ Server running on PORT: ${port}`);
});

module.exports = app;
