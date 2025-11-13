const jwt = require("jsonwebtoken");

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 🔒 Pastikan token dikirim dan berformat Bearer
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "No token provided",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    // ✅ Verifikasi token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Simpan user info ke req.user untuk akses di controller
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      status: decoded.status,
    };

    // 🚫 Cek status user
    if (req.user.status === false) {
      return res.status(403).json({
        success: false,
        message: "User is inactive or suspended",
      });
    }

    next();
  } catch (err) {
    console.error("❌ JWT verification error:", err.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
};

module.exports = authMiddleware;
