const express = require('express');
const { ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

function paymentRoutes(tasksCollection, proposalsCollection, paymentsCollection) {
  const router = express.Router();

  // Create Stripe Checkout Session
  router.post('/create-checkout-session', async (req, res) => {
    try {
      const { proposalId, taskId, amount, taskTitle, freelancerEmail, freelancerName, clientEmail } = req.body;

      if (!proposalId || !taskId || !amount) {
        return res.status(400).send({ error: "Missing required checkout parameters" });
      }

      const clientUrl = process.env.CLIENT_URL || "http://localhost:3000";

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: taskTitle || "Task Assignment",
                description: `Freelancer: ${freelancerName || freelancerEmail}`,
              },
              unit_amount: Math.round(Number(amount) * 100), // Amount in cents
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${clientUrl}/dashboard/client/proposals`,
        customer_email: clientEmail,
        metadata: {
          proposalId,
          taskId,
          freelancerEmail,
          freelancerName: freelancerName || "Freelancer",
          taskTitle: taskTitle || "Task Assignment",
          amount: amount.toString(),
        },
      });

      res.send({ url: session.url, sessionId: session.id });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Securely verify session and commit changes to DB
  router.post('/confirm-session', async (req, res) => {
    try {
      const { sessionId } = req.body;
      if (!sessionId) {
        return res.status(400).send({ error: "Session ID is required" });
      }

      // Retrieve session directly from Stripe to double-check
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status !== 'paid') {
        return res.status(400).send({ error: "Payment not completed" });
      }

      const { proposalId, taskId, freelancerEmail, freelancerName, taskTitle, amount } = session.metadata;

      // Prevent duplicate processing
      const existingPayment = await paymentsCollection.findOne({ transactionId: session.payment_intent });
      if (existingPayment) {
        return res.send({
          success: true,
          message: "Payment already confirmed",
          taskTitle,
          freelancerName,
          amount,
        });
      }

      // 1. Mark proposal as accepted
      await proposalsCollection.updateOne(
        { _id: new ObjectId(proposalId) },
        { $set: { status: "accepted", paidAt: new Date() } }
      );

      // 2. Mark task as in-progress
      await tasksCollection.updateOne(
        { _id: new ObjectId(taskId) },
        { $set: { status: "in-progress", acceptedProposalId: proposalId, updatedAt: new Date() } }
      );

      // 3. Save transaction record
      await paymentsCollection.insertOne({
        taskId,
        proposalId,
        taskTitle,
        amount: Number(amount),
        clientEmail: session.customer_email,
        freelancerEmail,
        freelancerName,
        transactionId: session.payment_intent,
        createdAt: new Date(),
      });

      res.send({
        success: true,
        taskTitle,
        freelancerName,
        amount,
      });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
}

module.exports = paymentRoutes;