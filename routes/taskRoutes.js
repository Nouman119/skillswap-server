const express = require('express');
const { ObjectId } = require('mongodb');

function taskRoutes(tasksCollection, proposalsCollection) {
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
      
      // Calculate total spent from completed/in-progress paid tasks
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
      status: "open", // Default state text: open
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

  return router;
}

module.exports = taskRoutes;