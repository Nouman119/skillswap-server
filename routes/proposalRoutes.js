const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (tasksCollection, proposalsCollection, paymentsCollection) => {
  const router = express.Router();

  // Submit Proposal
  router.post('/submit-proposal', async (req, res) => {
    try {
      const { taskId, taskTitle, freelancerEmail, freelancerName, budgetPrice, completionDays, message } = req.body;
      if (!taskId || !freelancerEmail || !budgetPrice || !completionDays || !message) {
        return res.status(400).send({ error: 'All input fields are required' });
      }

      const existingProposal = await proposalsCollection.findOne({ taskId, freelancerEmail });
      if (existingProposal) {
        return res.status(400).send({ error: 'You have already submitted a proposal for this task' });
      }

      const newProposal = {
        taskId,
        taskTitle: taskTitle || 'Task Application',
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
  });

  // Client proposals list
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

  // Reject proposal
  router.patch('/proposals/:id/reject', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await proposalsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'rejected', updatedAt: new Date() } }
      );
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Accept Proposal & Pay
  router.post('/proposals/:id/accept-and-pay', async (req, res) => {
    try {
      const { id } = req.params;
      const { transactionId } = req.body;

      const proposal = await proposalsCollection.findOne({ _id: new ObjectId(id) });
      if (!proposal) return res.status(404).send({ error: 'Proposal not found' });

      const existingAccepted = await proposalsCollection.findOne({ taskId: proposal.taskId, status: 'accepted' });
      if (existingAccepted) return res.status(400).send({ error: 'A proposal has already been accepted' });

      await proposalsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { status: 'accepted', paidAt: new Date() } });
      await tasksCollection.updateOne({ _id: new ObjectId(proposal.taskId) }, { $set: { status: 'in-progress', acceptedProposalId: id, updatedAt: new Date() } });

      if (paymentsCollection) {
        await paymentsCollection.insertOne({
          taskId: proposal.taskId,
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

  // Submit Deliverable
  router.patch('/:id/submit-deliverable', async (req, res) => {
    try {
      const { id } = req.params;
      const { deliverable_url } = req.body;
      if (!deliverable_url) return res.status(400).send({ error: 'Deliverable URL is required' });

      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: 'completed', deliverable_url, completedAt: new Date(), updatedAt: new Date() } }
      );
      res.send({ success: true, modifiedCount: result.modifiedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
};