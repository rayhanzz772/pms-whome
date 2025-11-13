const express = require("express");
const router = express.Router();

router.get("/status", (req, res) => {
  res.send("Running ⚡");
});

router.use("/users", require("./modules/user/index"));

module.exports = router;
