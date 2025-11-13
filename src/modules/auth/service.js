const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const db = require("../../../db/models"); 
const User = db.User;

/**
 * Login service menggunakan Sequelize ORM
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, user: object}>}
 */
exports.login = async (username, password) => {
  const user = await User.findOne({ where: { username } });

  if (!user) {
    throw new Error("Invalid username or password");
  }

  if (!user.status) {
    throw new Error("User account is inactive or suspended");
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    throw new Error("Invalid username or password");
  }

  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

  const userSafe = {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt,
  };

  return { token, user: userSafe };
};
