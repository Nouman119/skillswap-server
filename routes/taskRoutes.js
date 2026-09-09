const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (tasksCollection, usersCollection, proposalsCollection, paymentsCollection) => {
  const router = express.Router();

  // ----------------------------------------------------
  // SECTION 05: Public Top Freelancers Endpoint (Pure Database Driven)
  // ----------------------------------------------------
  router.get("/public/top-freelancers", async (req, res) => {
    try {
      if (!usersCollection) {
        return res.status(500).json({ error: "Users collection not initialized" });
      }

      const topFreelancers = await usersCollection
        .find({ role: "freelancer", isBlocked: { $ne: true } })
        .sort({ rating: -1, completedJobs: -1 })
        .limit(4)
        .toArray();

      const formatted = topFreelancers.map((f) => ({
        _id: f._id,
        name: f.name || "Freelancer",
        email: f.email,
        image: f.image || "",
        skills: Array.isArray(f.skills) ? f.skills.join(", ") : (f.skills || ""),
        rating: f.rating || 0,
        completedJobs: f.completedJobs || 0,
        hourlyRate: f.hourlyRate || 0,
      }));

      res.status(200).json(formatted);
    } catch (err) {
      console.error("Top Freelancers Route Error:", err);
      res.status(500).json({ error: "Failed to fetch top freelancers from database" });
    }
  });

  // ----------------------------------------------------
  // SECTION 05: Public Featured Tasks Endpoint for Home Page
  // ----------------------------------------------------
  router.get("/public/featured-tasks", async (req, res) => {
    try {
      const latestTasks = await tasksCollection
        .find({ status: "open" })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.status(200).json(latestTasks);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch featured tasks" });
    }
  });

  // ----------------------------------------------------
  // Get client dashboard statistics
  // ----------------------------------------------------
  router.get('/client-stats', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Client email is required" });
      }

      const tasks = await tasksCollection.find({ clientEmail: email }).toArray();
      
      const totalTasks = tasks.length;
      const openTasks = tasks.filter(t => t.status === 'open').length;
      const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
      
      const totalSpent = tasks
        .filter(t => t.status === 'completed' || t.status === 'in-progress')
        .reduce((sum, t) => sum + Number(t.budget || 0), 0);

      res.send({
        totalTasks,
        openTasks,
        inProgressTasks,
        totalSpent,
        tasks
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Create a new task post
  // ----------------------------------------------------
  router.post('/', async (req, res) => {
    try {
      const { title, category, description, budget, deadline, clientEmail, clientName } = req.body;
      
      if (!title || !category || !budget || !clientEmail) {
        return res.status(400).send({ error: "Required fields are missing" });
      }

      const newTask = {
        title,
        category,
        description,
        budget: Number(budget),
        deadline,
        clientEmail,
        clientName: clientName || "Client",
        status: "open",
        createdAt: new Date()
      };

      const result = await tasksCollection.insertOne(newTask);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Get all tasks posted by a specific client
  // ----------------------------------------------------
  router.get('/my-tasks', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Email is required" });

      const tasks = await tasksCollection.find({ clientEmail: email }).sort({ createdAt: -1 }).toArray();
      res.send(tasks);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Update task details (only if status is still 'open')
  // ----------------------------------------------------
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, category, description, budget, deadline } = req.body;

      const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
      if (!task) return res.status(404).send({ error: "Task not found" });

      if (task.status !== 'open') {
        return res.status(400).send({ error: "Only open tasks can be edited" });
      }

      const updateDoc = {
        $set: {
          title,
          category,
          description,
          budget: Number(budget),
          deadline,
          updatedAt: new Date()
        }
      };

      await tasksCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);
      res.send({ success: true, message: "Task updated successfully" });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Delete a task (only if no accepted proposal exists)
  // ----------------------------------------------------
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const acceptedProposal = await proposalsCollection.findOne({ 
        taskId: id, 
        status: "accepted" 
      });

      if (acceptedProposal) {
        return res.status(400).send({ error: "Cannot delete task with an accepted proposal" });
      }

      const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Get all proposals for a specific client's tasks
  // ----------------------------------------------------
  router.get('/client-proposals', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: "Client email is required" });

      const clientTasks = await tasksCollection.find({ clientEmail: email }).toArray();
      const taskIds = clientTasks.map(t => t._id.toString());

      const proposals = await proposalsCollection.find({ taskId: { $in: taskIds } }).toArray();
      res.send(proposals);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Reject a proposal
  // ----------------------------------------------------
  router.patch('/proposals/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await proposalsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "rejected", updatedAt: new Date() } }
      );
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Accept proposal & complete payment checkout flow
  // ----------------------------------------------------
  router.post('/proposals/:id/accept-and-pay', async (req, res) => {
    try {
      const { id } = req.params;
      const { transactionId } = req.body;

      const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
      if (!proposal) return res.status(404).send({ error: "Proposal not found" });

      const existingAccepted = await proposalsCollection.findOne({
        taskId: proposal.taskId,
        status: "accepted"
      });
      if (existingAccepted) {
        return res.status(400).send({ error: "A proposal has already been accepted for this task" });
      }

      await proposalsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "accepted", paidAt: new Date() } }
      );

      await tasksCollection.updateOne(
        { _id: new ObjectId(proposal.taskId) },
        { $set: { status: "in-progress", acceptedProposalId: id, updatedAt: new Date() } }
      );

      if (paymentsCollection) {
        await paymentsCollection.insertOne({
          taskId: proposal.taskId,
          proposalId: id,
          amount: proposal.budgetPrice || proposal.price,
          clientEmail: proposal.clientEmail,
          freelancerEmail: proposal.freelancerEmail,
          transactionId: transactionId || `TXN_${Date.now()}`,
          createdAt: new Date()
        });
      }

      res.send({ success: true, message: "Payment processed and task is now in-progress" });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Freelancer Dashboard Statistics Endpoint
  // ----------------------------------------------------
  router.get('/freelancer-stats', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Freelancer email is required" });
      }

      const proposals = await proposalsCollection.find({ freelancerEmail: email }).toArray();

      const totalProposals = proposals.length;
      const pendingProposals = proposals.filter(p => p.status === 'pending').length;
      const acceptedProposals = proposals.filter(p => p.status === 'accepted').length;

      const acceptedProposalIds = proposals.filter(p => p.status === 'accepted').map(p => p._id.toString());
      const completedTasks = await tasksCollection.find({
        acceptedProposalId: { $in: acceptedProposalIds },
        status: 'completed'
      }).toArray();

      const totalEarnings = completedTasks.reduce((sum, t) => sum + Number(t.budget || 0), 0);

      res.send({
        totalProposals,
        pendingProposals,
        acceptedProposals,
        totalEarnings
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Submit a Proposal
  // ----------------------------------------------------
  router.post('/submit-proposal', async (req, res) => {
    try {
      const { taskId, taskTitle, freelancerEmail, freelancerName, budgetPrice, completionDays, message } = req.body;

      if (!taskId || !freelancerEmail || !budgetPrice || !completionDays || !message) {
        return res.status(400).send({ error: "All input fields are required" });
      }

      const existingProposal = await proposalsCollection.findOne({
        taskId,
        freelancerEmail
      });

      if (existingProposal) {
        return res.status(400).send({ error: "You have already submitted a proposal for this task" });
      }

      const newProposal = {
        taskId,
        taskTitle: taskTitle || "Task Application",
        freelancerEmail,
        freelancerName: freelancerName || "Freelancer",
        budgetPrice: Number(budgetPrice),
        completionDays: Number(completionDays),
        message,
        status: "pending",
        createdAt: new Date()
      };

      const result = await proposalsCollection.insertOne(newProposal);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // My Proposals List
  // ----------------------------------------------------
  router.get('/my-proposals', async (req, res) => {
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
  router.get('/freelancer-projects', async (req, res) => {
    try {
      const email = req.query.freelancerEmail;
      if (!email) {
        return res.status(400).send({ error: "Freelancer email is required" });
      }

      const acceptedProposals = await proposalsCollection.find({
        freelancerEmail: email,
        status: "accepted"
      }).toArray();

      const taskIds = acceptedProposals.map(p => new ObjectId(p.taskId));

      const projects = await tasksCollection.find({
        _id: { $in: taskIds },
        status: { $in: ["in-progress", "completed"] }
      }).sort({ updatedAt: -1 }).toArray();

      res.send(projects);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Submit Deliverable & Complete Task
  // ----------------------------------------------------
  router.patch('/:id/submit-deliverable', async (req, res) => {
    try {
      const { id } = req.params;
      const { deliverable_url } = req.body;

      if (!deliverable_url) {
        return res.status(400).send({ error: "Deliverable URL is required" });
      }

      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            status: "completed",
            deliverable_url,
            completedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );

      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Freelancer Earnings Breakdown
  // ----------------------------------------------------
  router.get('/my-earnings', async (req, res) => {
    try {
      const email = req.query.freelancerEmail;
      if (!email) return res.status(400).send({ error: "Freelancer email is required" });

      const acceptedProposals = await proposalsCollection.find({
        freelancerEmail: email,
        status: "accepted"
      }).toArray();

      const taskIds = acceptedProposals.map(p => new ObjectId(p.taskId));

      const earnings = await tasksCollection.find({
        _id: { $in: taskIds },
        status: "completed"
      }).sort({ completedAt: -1 }).toArray();

      res.send(earnings);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Browse Open Tasks Pagination & Filtering
  // ----------------------------------------------------
  router.get('/open-tasks', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const search = req.query.search || "";
      const category = req.query.category || "";

      let query = { status: "open" };

      if (search) {
        query.title = { $regex: search, $options: "i" };
      }

      if (category && category !== "All") {
        query.category = category;
      }

      const skip = (page - 1) * limit;

      const tasks = await tasksCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalTasks = await tasksCollection.countDocuments(query);
      const totalPages = Math.ceil(totalTasks / limit);

      res.send({
        tasks,
        currentPage: page,
        totalPages,
        totalTasks,
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  // Admin Dashboard Overview Statistics
  // ----------------------------------------------------
  router.get("/admin/stats", async (req, res) => {
    try {
      const totalUsers = await usersCollection.countDocuments();
      const totalTasks = await tasksCollection.countDocuments();
      const activeTasks = await tasksCollection.countDocuments({ status: "in-progress" });

      const allPayments = await paymentsCollection.find().toArray();
      const totalRevenue = allPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      res.status(200).json({
        totalUsers,
        totalTasks,
        totalRevenue,
        activeTasks,
      });
    } catch (error) {
      console.error("Error fetching admin metrics:", error);
      res.status(500).json({ error: "Failed to fetch admin stats" });
    }
  });

  // ----------------------------------------------------
  // Manage Users - Get All Users
  // ----------------------------------------------------
  router.get("/admin/users", async (req, res) => {
    try {
      const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
      res.status(200).json(users);
    } catch (error) {
      console.error("Error fetching user list:", error);
      res.status(500).json({ error: "Failed to fetch platform accounts" });
    }
  });

  // ----------------------------------------------------
  // Manage Users - Block / Unblock User Status
  // ----------------------------------------------------
  router.patch("/admin/users/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isBlocked: Boolean(isBlocked), updatedAt: new Date() } }
      );

      if (result.matchedCount === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      res.status(200).json({ message: "User status updated successfully" });
    } catch (error) {
      console.error("Error updating user status:", error);
      res.status(500).json({ error: "Failed to update user status" });
    }
  });

  return router;
};