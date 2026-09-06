const express = require('express');
const { ObjectId } = require('mongodb');

// Pass paymentsCollection as the 3rd argument
function taskRoutes(tasksCollection, proposalsCollection, paymentsCollection) {
  const router = express.Router();

  // Get client dashboard statistics and tasks by client email
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

  // Create a new task post
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

  // Get all tasks posted by a specific client
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

  // Update task details (only if status is still 'open')
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

  // Delete a task (only if no accepted proposal exists)
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

  // Get all proposals for a specific client's tasks
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

  // Reject a proposal
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

  // Accept proposal & complete payment checkout flow
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

      // Fixed: using paymentsCollection directly
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

      // Calculate total earnings from completed projects
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
  // Browse Open Tasks
  // ----------------------------------------------------
  router.get('/open-tasks', async (req, res) => {
    try {
      const openTasks = await tasksCollection.find({ status: "open" }).sort({ createdAt: -1 }).toArray();
      res.send(openTasks);
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

      // Check if freelancer already submitted a proposal for this task
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
        status: "pending", // Default state text: pending
        createdAt: new Date()
      };

      const result = await proposalsCollection.insertOne(newProposal);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ----------------------------------------------------
  //  My Proposals List
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

      // Find accepted proposals for this freelancer
      const acceptedProposals = await proposalsCollection.find({
        freelancerEmail: email,
        status: "accepted"
      }).toArray();

      const taskIds = acceptedProposals.map(p => new ObjectId(p.taskId));

      // Find matched active or completed tasks
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

  return router;
}

module.exports = taskRoutes;