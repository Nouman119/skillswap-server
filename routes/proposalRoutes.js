const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (tasksCollection, proposalsCollection, paymentsCollection) => {
  const router = express.Router();

// ====================================================
  // 1. Submit Proposal (Supports both /proposals and /submit-proposal)
  // ====================================================
  const handleProposalSubmission = async (req, res) => {
    try {
      const { taskId, taskTitle, freelancerEmail, freelancerName, budgetPrice, completionDays, message } = req.body;
      if (!taskId || !freelancerEmail || !budgetPrice || !completionDays || !message) {
        return res.status(400).send({ error: 'All input fields are required' });
      }

      // Check if task exists and extract client information
      let clientEmail = null;
      if (ObjectId.isValid(taskId)) {
        const task = await tasksCollection.findOne({ _id: new ObjectId(taskId) });
        if (task) {
          clientEmail = task.clientEmail;
        }
      }

      const existingProposal = await proposalsCollection.findOne({ taskId: taskId.toString(), freelancerEmail });
      if (existingProposal) {
        return res.status(400).send({ error: 'You have already submitted a proposal for this task' });
      }

      const newProposal = {
        taskId: taskId.toString(),
        taskTitle: taskTitle || 'Task Application',
        clientEmail: clientEmail,
        freelancerEmail,
        freelancerName: freelancerName || 'Freelancer',
        budgetPrice: Number(budgetPrice),
        completionDays: Number(completionDays),
        message,
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await proposalsCollection.insertOne(newProposal);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  };

  // Route 1: When frontend calls /api/tasks/proposals
  router.post('/proposals', handleProposalSubmission);

  // Route 2: When frontend calls /api/tasks/submit-proposal
  router.post('/submit-proposal', handleProposalSubmission);


  // ====================================================
  // 2. Get All Proposals for a Specific Task (Fixed 404)
  // Endpoint: GET /api/tasks/proposals/:taskId
  // ====================================================
  router.get('/proposals/:taskId', async (req, res) => {
    try {
      const { taskId } = req.params;

      if (!taskId) {
        return res.status(400).send({ error: 'Task ID is required' });
      }

      // Query matching either string representation or MongoDB ObjectId
      const query = {
        $or: [
          { taskId: taskId },
          { taskId: taskId.toString() },
          ...(ObjectId.isValid(taskId) ? [{ taskId: new ObjectId(taskId) }] : [])
        ]
      };

      const proposals = await proposalsCollection.find(query).toArray();
      res.status(200).send(proposals);
    } catch (error) {
      console.error('Error fetching proposals for task:', error);
      res.status(500).send({ error: 'Failed to retrieve proposals for this task.' });
    }
  });

  // ====================================================
  // 3. Client Proposals Aggregated List
  // ====================================================
  router.get('/client-proposals', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: 'Client email is required' });

      const clientTasks = await tasksCollection.find({ clientEmail: email }).toArray();
      const taskIds = clientTasks.map((t) => t._id.toString());

      const proposals = await proposalsCollection.find({ taskId: { $in: taskIds } }).toArray();
      res.send(proposals);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // 4. Reject Proposal
  // ====================================================
  router.patch('/proposals/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Proposal ID format' });
      }

      const result = await proposalsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected', updatedAt: new Date() } }
      );
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // 5. Accept Proposal & Pay (Transition Task to In-Progress)
  // ====================================================
  router.post('/proposals/:id/accept-and-pay', async (req, res) => {
    try {
      const { id } = req.params;
      const { transactionId } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Proposal ID format' });
      }

      const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
      if (!proposal) return res.status(404).send({ error: 'Proposal not found' });

      const existingAccepted = await proposalsCollection.findOne({ 
        taskId: proposal.taskId.toString(), 
        status: 'accepted' 
      });
      if (existingAccepted) {
        return res.status(400).send({ error: 'A proposal has already been accepted for this task' });
      }

      // 1. Mark current proposal as accepted
      await proposalsCollection.updateOne(
        { _id: new ObjectId(id) }, 
        { $set: { status: 'accepted', paidAt: new Date() } }
      );

      // 2. Reject other pending proposals for the same task
      await proposalsCollection.updateMany(
        { 
          taskId: proposal.taskId.toString(), 
          _id: { $ne: new ObjectId(id) },
          status: 'pending'
        },
        { $set: { status: 'rejected', updatedAt: new Date() } }
      );

      // 3. Transition task status to in-progress
      const taskObjectId = ObjectId.isValid(proposal.taskId) ? new ObjectId(proposal.taskId) : null;
      if (taskObjectId) {
        await tasksCollection.updateOne(
          { _id: taskObjectId }, 
          { 
            $set: { 
              status: 'in-progress', 
              acceptedProposalId: id,
              assignedFreelancerEmail: proposal.freelancerEmail,
              updatedAt: new Date() 
            } 
          }
        );
      }

      // 4. Record escrow payment
      if (paymentsCollection) {
        await paymentsCollection.insertOne({
          taskId: proposal.taskId.toString(),
          proposalId: id,
          amount: proposal.budgetPrice || proposal.price,
          clientEmail: proposal.clientEmail,
          freelancerEmail: proposal.freelancerEmail,
          transactionId: transactionId || `TXN_${Date.now()}`,
          createdAt: new Date(),
        });
      }

      res.send({ success: true, message: 'Payment processed and task is in-progress' });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // 6. Submit Deliverable
  // ====================================================
  router.patch('/:id/submit-deliverable', async (req, res) => {
    try {
      const { id } = req.params;
      const { deliverable_url } = req.body;
      if (!deliverable_url) return res.status(400).send({ error: 'Deliverable URL is required' });

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Task ID format' });
      }

      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'completed', deliverable_url, completedAt: new Date(), updatedAt: new Date() } }
      );
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });


  // ====================================================
  // 7. Get Proposals Submitted by a Specific Freelancer
  // Endpoint: GET /api/tasks/freelancer-proposals?email=freelancer@email.com
  // ====================================================
  router.get('/freelancer-proposals', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: 'Freelancer email is required' });
      }

      const proposals = await proposalsCollection
        .find({ freelancerEmail: email })
        .sort({ createdAt: -1 })
        .toArray();

      res.status(200).send(proposals);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // 8. Get Freelancer Dashboard Statistics
 
  // ====================================================
  router.get('/freelancer-stats', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: 'Freelancer email is required' });
      }

      const proposals = await proposalsCollection.find({ freelancerEmail: email }).toArray();
      const totalProposals = proposals.length;
      const pendingProposals = proposals.filter((p) => (p.status || "").toLowerCase() === "pending").length;
      const acceptedProposals = proposals.filter((p) => (p.status || "").toLowerCase() === "accepted").length;

      // Fetch completed tasks assigned to this freelancer to calculate earnings
      const completedTasks = await tasksCollection.find({
        assignedFreelancerEmail: email,
        status: "completed"
      }).toArray();

      const totalEarnings = completedTasks.reduce((sum, item) => sum + Number(item.budget || 0), 0);

      res.status(200).send({
        totalProposals,
        pendingProposals,
        acceptedProposals,
        totalEarnings,
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get Client Tasks for Completed / Active Management
  // Endpoint: GET /api/tasks/client-tasks?email=client@email.com
  // ====================================================
  router.get('/client-tasks', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: 'Client email is required' });
      }

      const tasks = await tasksCollection.find({ clientEmail: email }).toArray();
      res.status(200).send(tasks);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

    // ====================================================
  // Freelancer project
 
  // ====================================================
  router.get('/freelancer-projects', async (req, res) => {
  try {
    const freelancerEmail = req.query.freelancerEmail;
    // Find tasks where assignedFreelancerEmail matches and status is in-progress or completed
    const projects = await tasksCollection.find({ 
      assignedFreelancerEmail: freelancerEmail,
      status: { $in: ['in-progress', 'completed'] }
    }).toArray();
    res.send(projects);
  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

  return router;
};