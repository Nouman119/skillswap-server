const express = require('express');
const router = express.Router();

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