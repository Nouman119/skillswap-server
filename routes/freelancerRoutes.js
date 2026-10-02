const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (usersCollection, tasksCollection, proposalsCollection) => {
  const router = express.Router();

  // ----------------------------------------------------
  // Handler: Public Top Freelancers
  // ----------------------------------------------------
  const getFreelancersHandler = async (req, res) => {
    try {
      if (!usersCollection) {
        return res.status(500).json({ error: "Users collection not initialized" });
      }

      const freelancers = await usersCollection
        .find({ role: "freelancer", isBlocked: { $ne: true } })
        .limit(6)
        .toArray();

      const formatted = freelancers.map((f) => ({
        _id: f._id,
        name: f.name || "Freelancer",
        email: f.email,
        image: f.image || "",
        skills: Array.isArray(f.skills) ? f.skills.join(", ") : (f.skills || ""),
        rating: f.rating || 0,
        completedJobs: f.completedJobs || 0,
        hourlyRate: f.hourlyRate || 0,
        bio: f.bio || "",
      }));

      res.status(200).json(formatted);
    } catch (err) {
      console.error("Fetch All Freelancers Error:", err);
      res.status(500).json({ error: "Failed to fetch freelancers from database" });
    }
  };

  // দুটি পাথেই সাপোর্ট দেওয়া হলো
  router.get("/freelancers", getFreelancersHandler);
  router.get("/public/top-freelancers", getFreelancersHandler);

  // ----------------------------------------------------
  // Update Freelancer Profile (PUT /freelancers/profile)
  // ----------------------------------------------------
  router.put("/freelancers/profile", async (req, res) => {
    try {
      if (!usersCollection) {
        return res.status(500).json({ error: "Users collection not initialized" });
      }

      const { email, userId, name, image, skills, bio, hourlyRate } = req.body;
      const cleanEmail = email ? email.trim() : "";

      const queryConditions = [];
      if (cleanEmail) {
        queryConditions.push({ email: { $regex: new RegExp(`^${cleanEmail}$`, "i") } });
      }
      if (userId && ObjectId.isValid(userId)) {
        queryConditions.push({ _id: new ObjectId(userId) });
      }

      if (queryConditions.length === 0) {
        return res.status(400).json({ error: "User email or ID is required" });
      }

      const skillsArray = typeof skills === "string"
        ? skills.split(",").map((s) => s.trim()).filter(Boolean)
        : (Array.isArray(skills) ? skills : []);

      const updateDoc = {
        $set: {
          name,
          image,
          skills: skillsArray,
          bio,
          hourlyRate: Number(hourlyRate) || 0,
          updatedAt: new Date(),
        },
      };

      const result = await usersCollection.updateOne({ $or: queryConditions }, updateDoc);

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "User not found with this email or ID" });
      }

      res.status(200).json({ success: true, message: "Profile updated successfully" });
    } catch (err) {
      console.error("Profile update error:", err);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // ----------------------------------------------------
  // Freelancer Dashboard Statistics Endpoint
  // ----------------------------------------------------
  router.get("/freelancer-stats", async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Freelancer email is required" });
      }

      const proposals = await proposalsCollection.find({ freelancerEmail: email }).toArray();

      const totalProposals = proposals.length;
      const pendingProposals = proposals.filter((p) => p.status === "pending").length;
      const acceptedProposals = proposals.filter((p) => p.status === "accepted").length;

      const acceptedProposalIds = proposals
        .filter((p) => p.status === "accepted")
        .map((p) => p._id.toString());

      const completedTasks = await tasksCollection.find({
        acceptedProposalId: { $in: acceptedProposalIds },
        status: "completed",
      }).toArray();

      const totalEarnings = completedTasks.reduce((sum, t) => sum + Number(t.budget || 0), 0);

      res.send({
        totalProposals,
        pendingProposals,
        acceptedProposals,
        totalEarnings,
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // My Proposals List
  // ----------------------------------------------------
  router.get("/my-proposals", async (req, res) => {
    try {
      const email = req.query.freelancerEmail;
      if (!email) {
        return res.status(400).send({ error: "Freelancer email is required" });
      }

      const proposals = await proposalsCollection
        .find({ freelancerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(proposals);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Freelancer Active & Completed Projects
  // ----------------------------------------------------
  router.get("/freelancer-projects", async (req, res) => {
    try {
      const email = req.query.freelancerEmail;
      if (!email) {
        return res.status(400).send({ error: "Freelancer email is required" });
      }

      const acceptedProposals = await proposalsCollection.find({
        freelancerEmail: email,
        status: "accepted",
      }).toArray();

      const taskIds = acceptedProposals.map((p) => new ObjectId(p.taskId));

      const projects = await tasksCollection.find({
        _id: { $in: taskIds },
        status: { $in: ["in-progress", "completed"] },
      }).sort({ updatedAt: -1 }).toArray();

      res.send(projects);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get Single Freelancer Public Profile by ID
  // ====================================================
  router.get('/freelancers/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'Invalid Freelancer ID' });
      }

      // usersCollection থেকে ফ্রিল্যান্সারের তথ্য খোঁজা
      const freelancer = await usersCollection.findOne(
        { _id: new ObjectId(id) },
        { projection: { password: 0 } } // সিকিউরিটির জন্য পাসওয়ার্ড বাদ দিয়ে ডেটা পাঠানো
      );

      if (!freelancer) {
        return res.status(404).json({ error: 'Freelancer profile not found' });
      }

      res.status(200).json(freelancer);
    } catch (error) {
      console.error('Error fetching freelancer profile:', error);
      res.status(500).json({ error: 'Failed to fetch freelancer details' });
    }
  });

  // ----------------------------------------------------
  // Freelancer Earnings Breakdown
  // ----------------------------------------------------
  router.get("/my-earnings", async (req, res) => {
    try {
      const email = req.query.freelancerEmail;
      if (!email) return res.status(400).send({ error: "Freelancer email is required" });

      const acceptedProposals = await proposalsCollection.find({
        freelancerEmail: email,
        status: "accepted",
      }).toArray();

      const taskIds = acceptedProposals.map((p) => new ObjectId(p.taskId));

      const earnings = await tasksCollection.find({
        _id: { $in: taskIds },
        status: "completed",
      }).sort({ completedAt: -1 }).toArray();

      res.send(earnings);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
};