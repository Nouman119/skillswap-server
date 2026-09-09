const express = require("express");
const router = express.Router();

module.exports = (usersCollection) => {
  // ----------------------------------------------------
  // Email/Password Registration with Password Constraints
  // ----------------------------------------------------
  router.post("/register", async (req, res) => {
    try {
      const { name, email, password, image, role } = req.body;

      if (!name || !email || !password) {
        return res.status(400).json({ error: "Name, email, and password are required" });
      }

      // Password Constraints: min 6 chars, 1 uppercase, 1 lowercase
      const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z]).{6,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          error: "Password must be at least 6 characters long and include at least one uppercase and one lowercase letter",
        });
      }

      // Check existing user
      const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.status(409).json({ error: "User already registered with this email" });
      }

      // Manual form role: client or freelancer (default to client)
      const assignedRole = role === "freelancer" ? "freelancer" : "client";

      const newUser = {
        name,
        email: email.toLowerCase(),
        password, // In production, hash with bcrypt
        image: image || "",
        role: assignedRole,
        isBlocked: false,
        createdAt: new Date(),
      };

      const result = await usersCollection.insertOne(newUser);
      const { password: _, ...userSafe } = newUser;

      res.status(201).json({
        message: "Registration successful",
        user: { _id: result.insertedId, ...userSafe },
      });
    } catch (err) {
      console.error("Register Error:", err);
      res.status(500).json({ error: "Internal server error during registration" });
    }
  });

  // ----------------------------------------------------
  // Email/Password Login
  // ----------------------------------------------------
  router.post("/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const user = await usersCollection.findOne({ email: email.toLowerCase() });

      if (!user || user.password !== password) {
        return res.status(401).json({ error: "Invalid email or password" });
      }

      if (user.isBlocked) {
        return res.status(403).json({ error: "Your account has been suspended by administration" });
      }

      const { password: _, ...userSafe } = user;
      res.json({
        message: "Login successful",
        user: userSafe,
      });
    } catch (err) {
      console.error("Login Error:", err);
      res.status(500).json({ error: "Internal server error during login" });
    }
  });

  // ----------------------------------------------------
  // Google OAuth Auto-Client Sync Endpoint
  // ---------------------------------------------------
  router.post("/google", async (req, res) => {
    try {
      const { email, name, image } = req.body;

      if (!email) {
        return res.status(400).json({ error: "Google profile email missing" });
      }

      let user = await usersCollection.findOne({ email: email.toLowerCase() });

      if (!user) {
        // Requirement: Google OAuth sign-ups automatically assigned as Client
        const newUser = {
          name: name || "Google User",
          email: email.toLowerCase(),
          image: image || "",
          role: "client",
          provider: "google",
          isBlocked: false,
          createdAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        user = { _id: result.insertedId, ...newUser };
      } else {
        if (user.isBlocked) {
          return res.status(403).json({ error: "Your account has been suspended" });
        }
      }

      const { password: _, ...userSafe } = user;
      res.json({
        message: "Google authentication successful",
        user: userSafe,
      });
    } catch (err) {
      console.error("Google Auth Error:", err);
      res.status(500).json({ error: "Failed to process Google login" });
    }
  });

  return router;
};