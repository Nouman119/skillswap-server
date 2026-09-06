const express = require('express');
const router = express.Router();

// ----------------------------------------------------
// Import jsonwebtoken for auth token generation
// ----------------------------------------------------
const jwt = require('jsonwebtoken');

// Export a function that accepts database collections
module.exports = (usersCollection) => {

  // POST: Create or save user upon registration / social login
  router.post('/', async (req, res) => {
    try {
      const user = req.body;
      console.log("Received user data:", user);
      const query = { email: user.email };
      
      // Check if user already exists in the database
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      // Default fields according to Section 13: name, email, image, role, skills, bio, isBlocked, createdAt
      const newUser = {
        name: user.name,
        email: user.email,
        image: user.image || '',
        role: user.role || 'client', // Default role is client unless specified
        skills: user.skills || [],
        bio: user.bio || '',
        isBlocked: false,
        createdAt: new Date()
      };

      const result = await usersCollection.insertOne(newUser);
      res.status(201).send(result);
    } catch (error) {
      console.error("Error saving user:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  //  Update Freelancer Profile
  // ----------------------------------------------------
  router.patch('/profile', async (req, res) => {
    try {
      const { email, name, image, skills, bio, hourlyRate } = req.body;
      if (!email) return res.status(400).send({ error: "User email is required" });

      const updateDoc = {
        $set: {
          name,
          image,
          skills: Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim()),
          bio,
          hourlyRate: Number(hourlyRate || 0),
          updatedAt: new Date()
        }
      };

      const result = await usersCollection.updateOne({ email }, updateDoc);
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  //  Get Current User Profile Details
  // ----------------------------------------------------
  router.get('/profile', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Email is required" });

      const user = await usersCollection.findOne({ email });
      res.send(user || {});
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Generate JWT & Set HTTPOnly Cookie
  // ----------------------------------------------------
  router.post('/jwt', async (req, res) => {
    try {
      const { email, role } = req.body;
      if (!email) {
        return res.status(400).send({ error: "Email is required for token" });
      }

      const token = jwt.sign(
        { email, role },
        process.env.JWT_SECRET || "skillswap_jwt_super_secret_key_2026",
        { expiresIn: "7d" }
      );

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Clear HTTPOnly Cookie on Logout
  // ----------------------------------------------------
  router.post('/logout', async (req, res) => {
    try {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true, message: "Logged out successfully" });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // GET: Get user role by email
  router.get('/:email', async (req, res) => {
    try {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }
      res.send({ role: user.role, isBlocked: user.isBlocked });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
};