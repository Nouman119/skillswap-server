const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { ObjectId } = require('mongodb');

// Export a function that accepts database collections
module.exports = (usersCollection) => {

  // POST: Create or save user upon registration / social login
  router.post('/', async (req, res) => {
    try {
      const user = req.body;
      const query = { email: user.email };
      
      const existingUser = await usersCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'User already exists', insertedId: null });
      }

      const newUser = {
        name: user.name,
        email: user.email,
        image: user.image || '',
        role: user.role || 'client',
        skills: user.skills || [],
        bio: user.bio || '',
        hourlyRate: Number(user.hourlyRate) || 20,
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
  // Update User / Freelancer Profile (Supports both PUT & PATCH)
  // Endpoints: PUT /api/users/profile & PATCH /api/users/profile
  // ----------------------------------------------------
  const handleProfileUpdate = async (req, res) => {
    try {
      const { email, name, image, skills, bio, hourlyRate, phone, company } = req.body;
      if (!email) {
        return res.status(400).json({ error: "User email is required" });
      }

      const cleanEmail = email.trim().toLowerCase();

      const updateFields = {
        name: name ? name.trim() : "Freelancer",
        bio: bio ? bio.trim() : "",
        image: image ? image.trim() : "",
        updatedAt: new Date()
      };

      if (phone !== undefined) updateFields.phone = phone;
      if (company !== undefined) updateFields.company = company;

      if (skills !== undefined) {
        updateFields.skills = Array.isArray(skills) 
          ? skills 
          : String(skills).split(',').map((s) => s.trim()).filter(Boolean);
      }

      if (hourlyRate !== undefined) {
        updateFields.hourlyRate = Number(hourlyRate) || 0;
      }

      // Case-insensitive regex দিয়ে আপডেট এবং upsert
      const result = await usersCollection.updateOne(
        { email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } },
        { 
          $set: updateFields,$setOnInsert: { email: cleanEmail, createdAt: new Date(), isBlocked: false }
        },
        { upsert: true }
      );

      return res.status(200).json({ success: true, message: "Profile updated successfully" });
    } catch (error) {
      console.error("Profile update error:", error);
      return res.status(500).json({ error: error.message });
    }
  };

  router.put('/profile', handleProfileUpdate);
  router.patch('/profile', handleProfileUpdate);

  
  // ----------------------------------------------------
  // Get Current User Profile Details
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
      const user = await usersCollection.findOne({ email });
      if (!user) {
        return res.status(404).send({ message: 'User not found' });
      }
      res.send({ role: user.role, isBlocked: user.isBlocked });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get all registered users for admin management
  // ====================================================
  router.get('/admin/users', async (req, res) => {
    try {
      const users = await usersCollection.find({}).toArray();
      res.status(200).send(users);
    } catch (error) {
      console.error("Error fetching users for admin:", error);
      res.status(500).send({ error: error.message });
    }
  });

// ====================================================
  // Toggle user block/unblock status by admin
  // ====================================================
  router.patch('/admin/users/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked, status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid User ID format" });
      }

      // Determine boolean blocked flag from either 'status' or 'isBlocked'
      let shouldBlock = false;
      if (typeof isBlocked !== "undefined") {
        shouldBlock = Boolean(isBlocked);
      } else if (status) {
        shouldBlock = String(status).toLowerCase() === "blocked";
      }

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            isBlocked: shouldBlock,
            status: shouldBlock ? "blocked" : "active",
            updatedAt: new Date() 
          } 
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({ error: "User not found" });
      }

      res.status(200).send({ 
        success: true, 
        message: `User marked as ${shouldBlock ? "BLOCKED" : "ACTIVE"} successfully`,
        isBlocked: shouldBlock,
        status: shouldBlock ? "blocked" : "active"
      });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).send({ error: error.message });
    }
  });


  return router;
};