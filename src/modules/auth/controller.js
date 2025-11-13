const authService = require("./service");
const jwt = require("jsonwebtoken");

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const { token, user } = await authService.login(username, password);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.json({
      success: true,
      message: "Login successful",
      data: {
        token,
        user,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    return res.status(401).json({
      success: false,
      message: err.message || "Login failed",
    });
  }
};

exports.logout = async (req, res) => {
  try {
    res.clearCookie("token");
    return res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("❌ Logout error:", err.message);
    return res.status(500).json({
      success: false,
      message: err.message || "Logout failed",
    });
  }
};
