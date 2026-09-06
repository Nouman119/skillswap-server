const express = require('express');
const { ObjectId } = require('mongodb');

function reviewRoutes(reviewsCollection, tasksCollection) {
  const router = express.Router();

  // Post a review for a completed task
  router.post('/', async (req, res) => {
    try {
      const { task_id, reviewer_email, reviewee_email, rating, comment } = req.body;

      if (!task_id || !reviewer_email || !reviewee_email || !rating) {
        return res.status(400).send({ error: "Required review fields are missing" });
      }

      const newReview = {
        task_id,
        reviewer_email,
        reviewee_email,
        rating: Number(rating),
        comment: comment || "",
        createdAt: new Date()
      };

      const result = await reviewsCollection.insertOne(newReview);
      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Get reviews for a specific user
  router.get('/', async (req, res) => {
    try {
      const email = req.query.email;
      if (!email) {
        return res.status(400).send({ error: "Email query parameter is required" });
      }

      const reviews = await reviewsCollection.find({ reviewee_email: email }).sort({ createdAt: -1 }).toArray();
      res.send(reviews);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
}

module.exports = reviewRoutes;