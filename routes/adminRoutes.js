const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (usersCollection, tasksCollection, paymentsCollection) => {
  const router = express.Router();

  router.get('/stats', async (req, res) => {
    try {
      const totalUsers = await usersCollection.countDocuments();
      const totalTasks = await tasksCollection.countDocuments();
      const activeTasks = await tasksCollection.countDocuments({ status: 'in-progress' });

      const allPayments = await paymentsCollection.find().toArray();
      const totalRevenue = allPayments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

      res.status(200).json({ totalUsers, totalTasks, totalRevenue, activeTasks });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch admin stats' });
    }
  });

  router.get('/users', async (req, res) => {
    try {
      const users = await usersCollection.find().sort({ createdAt: -1 }).toArray();
      res.status(200).json(users);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });

  router.patch('/users/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { isBlocked } = req.body;

      const result = await usersCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isBlocked: Boolean(isBlocked), updatedAt: new Date() } }
      );

      if (result.matchedCount === 0) return res.status(404).json({ error: 'User not found' });
      res.status(200).json({ message: 'User status updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update user status' });
    }
  });

  // ====================================================
  // Get Admin Dashboard Overview Statistics
  // Endpoint: GET /api/tasks/admin/stats
  // ====================================================
  router.get('/admin/stats', async (req, res) => {
    try {
      // 1. Count total users
      const totalUsers = await usersCollection.estimatedDocumentCount();

      // 2. Count total tasks and active tasks
      const totalTasks = await tasksCollection.estimatedDocumentCount();
      const activeTasksCount = await tasksCollection.countDocuments({ status: 'in-progress' });

      // 3. Calculate total revenue from payments collection
      const payments = await paymentsCollection.find({}).toArray();
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

  return router;
};