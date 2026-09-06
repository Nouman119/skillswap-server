const jwt = require('jsonwebtoken');

// ----------------------------------------------------
// erify JWT from HTTPOnly Cookie
// ----------------------------------------------------
const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ error: "Unauthorized access: No token provided" });
  }

  jwt.verify(
    token,
    process.env.JWT_SECRET || "skillswap_jwt_super_secret_key_2026",
    (err, decoded) => {
      if (err) {
        return res.status(401).send({ error: "Unauthorized access: Invalid or expired token" });
      }

      req.user = decoded; // Attach user payload ({ email, role }) to request
      next();
    }
  );
};

// ----------------------------------------------------
// Verify User Role (403 Forbidden on Mismatch)
// ----------------------------------------------------
const verifyRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).send({ error: "Forbidden access: Insufficient role permissions" });
    }
    next();
  };
};

module.exports = { verifyToken, verifyRole };