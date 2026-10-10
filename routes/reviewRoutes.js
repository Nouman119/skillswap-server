const express = require('express');
const { ObjectId } = require('mongodb');

function reviewRoutes(reviewsCollection, tasksCollection) {
  const router = express.Router();

  // Post a review for a completed task
// Post a review for a completed task
  router.post('/', async (req, res) => {
    try {
      const {
        task_id,
        taskId,
        reviewer_email,
        reviewerEmail,
        reviewee_email,
        revieweeEmail,
        rating,
        comment,
      } = req.body;

      const finalTaskId = task_id || taskId;
      const finalReviewerEmail = (reviewer_email || reviewerEmail || "").trim().toLowerCase();
      const finalRevieweeEmail = (reviewee_email || revieweeEmail || "").trim().toLowerCase();

      if (!finalTaskId || !finalReviewerEmail || !finalRevieweeEmail || !rating) {
        return res.status(400).send({ error: "Required review fields are missing" });
      }

      const newReview = {
        task_id: finalTaskId,
        reviewer_email: finalReviewerEmail,
        reviewee_email: finalRevieweeEmail,
        rating: Number(rating),
        comment: comment || "",
        createdAt: new Date(),
      };

      const result = await reviewsCollection.insertOne(newReview);

      if (tasksCollection && ObjectId.isValid(finalTaskId)) {
        await tasksCollection.updateOne(
          { _id: new ObjectId(finalTaskId) },
          { $set: { hasReviewed: true, reviewedAt: new Date() } }
        );
      }

      res.status(201).send({ success: true, insertedId: result.insertedId });
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  // Get reviews for a specific user / freelancer
  router.get('/', async (req, res) => {
    try {
      const targetEmail = req.query.email || req.query.revieweeEmail;

      if (!targetEmail) {
        return res.status(400).send({ error: "Email query parameter is required" });
      }

      const cleanEmail = targetEmail.trim();

      const reviews = await reviewsCollection
        .find({
          $or: [
            { reviewee_email: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } },
            { revieweeEmail: { $regex: new RegExp(`^${cleanEmail}$`, 'i') } }
          ]
        })
        .sort({ createdAt: -1 })
        .toArray();

      res.send(reviews);
    } catch (error) {
      res.status(500).send({ error: error.message });
    }
  });

  return router;
}

module.exports = reviewRoutes;