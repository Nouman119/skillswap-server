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
      const { deliverable_url, deliverableUrl } = req.body;
      const url = deliverable_url || deliverableUrl;

      if (!url) {
        return res.status(400).send({ error: 'Deliverable URL is required' });
      }

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Task ID format' });
      }

      const result = await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { 
          $set: { 
            status: 'completed', 
            deliverable_url: url, 
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
    const { email } = req.query;
    const projects = await tasksCollection.find({
      $or: [
        { assignedFreelancerEmail: email },
        { freelancerEmail: email }
      ]
    }).toArray();
    res.send(projects);
  } catch (err) {
    res.status(500).send({ error: err.message });
  }
});

  // ====================================================
  // Get Admin Dashboard Overview Statistics
  // Endpoint: GET /api/tasks/admin/stats
  // ====================================================
  router.get('/admin/stats', async (req, res) => {
    try {
      // Access collections directly from database connection if passed or via req.app
      const db = req.app.locals.db || tasksCollection.s.db;

      const usersColl = db.collection('users');
      const tasksColl = db.collection('tasks');
      const paymentsColl = db.collection('payments');

      const totalUsers = await usersColl.estimatedDocumentCount();
      const totalTasks = await tasksColl.estimatedDocumentCount();
      const activeTasksCount = await tasksColl.countDocuments({ status: 'in-progress' });

      const payments = await paymentsColl.find({}).toArray();
      const totalRevenue = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

      res.status(200).send({
        totalUsers,
        totalTasks,
        totalRevenue,
        activeTasks: activeTasksCount,
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get all registered users for admin management
  // Endpoint: GET /api/tasks/admin/users
  // ====================================================
  router.get('/admin/users', async (req, res) => {
    try {
      const db = req.app.locals.db || tasksCollection.s.db;
      const usersColl = db.collection('users');
      const users = await usersColl.find({}).toArray();
      res.status(200).send(users);
    } catch (error) {
      console.error("Error fetching users for admin:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get all tasks for admin moderation
  // Endpoint: GET /api/tasks/admin/tasks
  // ====================================================
  router.get('/admin/tasks', async (req, res) => {
    try {
      const db = req.app.locals.db || tasksCollection.s.db;
      const tasksColl = db.collection('tasks');
      const tasks = await tasksColl.find({}).toArray();
      res.status(200).send(tasks);
    } catch (error) {
      console.error("Error fetching tasks for admin:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Delete task by admin for policy violation
  // Endpoint: DELETE /api/tasks/:id
  // ====================================================
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { ObjectId } = require('mongodb');

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: "Invalid Task ID format" });
      }

      const db = req.app.locals.db || tasksCollection.s.db;
      const tasksColl = db.collection('tasks');

      const result = await tasksColl.deleteOne({ _id: new ObjectId(id) });

      if (result.deletedCount === 0) {
        return res.status(404).send({ error: "Task not found" });
      }

      res.status(200).send({ success: true, message: "Task deleted successfully" });
    } catch (error) {
      console.error("Error deleting task:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Get all Stripe payment transactions for admin history
  // Endpoint: GET /api/tasks/admin/transactions
  // ====================================================
  router.get('/admin/transactions', async (req, res) => {
    try {
      const db = req.app.locals.db || tasksCollection.s.db;
      const paymentsColl = db.collection('payments');
      const transactions = await paymentsColl.find({}).toArray();
      res.status(200).send(transactions);
    } catch (error) {
      console.error("Error fetching transactions for admin:", error);
      res.status(500).send({ error: error.message });
    }
  });

  // ====================================================
  // Create Stripe Checkout Session for Task Payment
  // Endpoint: POST /api/create-checkout-session
  // ====================================================
  router.post('/create-checkout-session', async (req, res) => {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const { taskId, amount, taskTitle, clientEmail, freelancerEmail, freelancerName } = req.body;

      if (!amount || !taskId) {
        return res.status(400).send({ error: "Amount and Task ID are required for payment" });
      }

      // Create Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: taskTitle || 'SkillSwap Task',
                description: `Payment for task ID: ${taskId}`,
              },
              unit_amount: Math.round(Number(amount) * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}&taskId=${taskId}&clientEmail=${clientEmail}&freelancerEmail=${freelancerEmail}&amount=${amount}&taskTitle=${encodeURIComponent(taskTitle || '')}&freelancerName=${encodeURIComponent(freelancerName || '')}`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/dashboard/client`,
      });

      res.status(200).send({ url: session.url });
    } catch (error) {
      console.error("Error creating Stripe checkout session:", error);
      res.status(500).send({ error: error.message });
    }
  });
  // ====================================================
  // Verify Stripe Session & Complete Payment / Update Task
  // Endpoint: POST /api/payments/confirm-session
  // ====================================================
  router.post('/confirm-session', async (req, res) => {
    try {
      const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
      const { sessionId, taskId, clientEmail, freelancerEmail, amount } = req.body;

      if (!sessionId || !taskId) {
        return res.status(400).send({ error: "Session ID and Task ID are required" });
      }

      // Retrieve session from Stripe to verify payment status
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (!session || session.payment_status !== 'paid') {
        return res.status(400).send({ error: "Payment not completed or invalid session" });
      }

      // Check if payment already recorded for this session to prevent duplicates
      const existingPayment = await paymentsCollection.findOne({ transactionId: sessionId });
      if (existingPayment) {
        return res.status(200).send({ success: true, message: "Payment already processed" });
      }

      // 1. Record payment in payments collection
      await paymentsCollection.insertOne({
        taskId: taskId.toString(),
        clientEmail: clientEmail || session.customer_details?.email,
        freelancerEmail: freelancerEmail,
        amount: amount || session.amount_total / 100,
        transactionId: sessionId,
        payment_status: 'paid',
        paid_at: new Date(),
        createdAt: new Date(),
      });

      // 2. Transition task status to in-progress
      const taskObjectId = ObjectId.isValid(taskId) ? new ObjectId(taskId) : null;
      if (taskObjectId) {
        await tasksCollection.updateOne(
          { _id: taskObjectId },
          {
            $set: {
              status: 'in-progress',
              assignedFreelancerEmail: freelancerEmail,
              updatedAt: new Date()
            }
          }
        );
      }

      // 3. Update proposal status to accepted if matching
      await proposalsCollection.updateMany(
        { taskId: taskId.toString(), freelancerEmail: freelancerEmail },
        { $set: { status: 'accepted', paidAt: new Date() } }
      );

      res.status(200).send({ success: true, message: "Payment verified and task updated successfully" });
    } catch (error) {
      console.error("Error confirming Stripe session:", error);
      res.status(500).send({ error: error.message });
    }
  });


  return router;
};