const express = require('express');
const { ObjectId } = require('mongodb');

module.exports = (tasksCollection, proposalsCollection) => {
  const router = express.Router();

  // Public Featured Tasks
  router.get('/public/featured-tasks', async (req, res) => {
    try {
      const latestTasks = await tasksCollection
        .find({ status: 'open' })
        .sort({ createdAt: -1 })
        .limit(6)
        .toArray();
      res.status(200).json(latestTasks);
    } catch (err) {
      res.status(500).json({ error: 'Failed to fetch featured tasks' });
    }
  });

  // Browse Open Tasks (With Pagination & Filters)
  router.get('/open-tasks', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 9;
      const search = req.query.search || '';
      const category = req.query.category || '';

      let query = { status: 'open' };
      if (search) query.title = { $regex: search, $options: 'i' };
      if (category && category !== 'All') query.category = category;

      const skip = (page - 1) * limit;
      const tasks = await tasksCollection
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray();

      const totalTasks = await tasksCollection.countDocuments(query);
      const totalPages = Math.ceil(totalTasks / limit);

      res.send({ tasks, currentPage: page, totalPages, totalTasks });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Client's posted tasks
  router.get('/my-tasks', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: 'Email is required' });

      const tasks = await tasksCollection.find({ clientEmail: email }).sort({ createdAt: -1 }).toArray();
      res.send(tasks);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Client stats
  router.get('/client-stats', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) return res.status(400).send({ error: 'Client email is required' });

      const tasks = await tasksCollection.find({ clientEmail: email }).toArray();
      const totalTasks = tasks.length;
      const openTasks = tasks.filter((t) => t.status === 'open').length;
      const inProgressTasks = tasks.filter((t) => t.status === 'in-progress').length;
      const totalSpent = tasks
        .filter((t) => t.status === 'completed' || t.status === 'in-progress')
        .reduce((sum, t) => sum + Number(t.budget || 0), 0);

      res.send({ totalTasks, openTasks, inProgressTasks, totalSpent, tasks });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

// ====================================================
  // Get Single Task Details by ID (Safeguarded)
  // ====================================================
  router.get('/:id', async (req, res, next) => {
    try {
      const { id } = req.params;

      // যদি id ভ্যালিড MongoDB ObjectId না হয়, তবে এরর না দিয়ে পরবর্তী রাউটে (যেমন freelancerRoutes) পাঠিয়ে দাও
      if (!ObjectId.isValid(id)) {
        return next();
      }

      const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
      if (!task) {
        return res.status(404).json({ error: 'Task not found' });
      }

      res.status(200).json(task);
    } catch (error) {
      console.error('Error fetching task by ID:', error);
      res.status(500).json({ error: 'Failed to fetch task details' });
    }
  });

  
  // Create a new task
  router.post('/', async (req, res) => {
    try {
      const { title, category, description, budget, deadline, clientEmail, clientName } = req.body;
      if (!title || !category || !budget || !clientEmail) {
        return res.status(400).send({ error: 'Required fields are missing' });
      }

      const newTask = {
        title,
        category,
        description,
        budget: Number(budget),
        deadline,
        clientEmail,
        clientName: clientName || 'Client',
        status: 'open',
        createdAt: new Date(),
      };

      const result = await tasksCollection.insertOne(newTask);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Edit task
  router.patch('/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { title, category, description, budget, deadline } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Task ID' });
      }

      const task = await tasksCollection.findOne({ _id: new ObjectId(id) });
      if (!task) return res.status(404).send({ error: 'Task not found' });
      if (task.status !== 'open') return res.status(400).send({ error: 'Only open tasks can be edited' });

      await tasksCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { title, category, description, budget: Number(budget), deadline, updatedAt: new Date() } }
      );
      res.send({ success: true, message: 'Task updated successfully' });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Delete task
  router.delete('/:id', async (req, res) => {
    try {
      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ error: 'Invalid Task ID' });
      }

      const acceptedProposal = await proposalsCollection.findOne({ taskId: id, status: 'accepted' });
      if (acceptedProposal) {
        return res.status(400).send({ error: 'Cannot delete task with an accepted proposal' });
      }

      const result = await tasksCollection.deleteOne({ _id: new ObjectId(id) });
      res.send({ success: true, deletedCount: result.deletedCount });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
};