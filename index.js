const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [process.env.CLIENT_URL || 'http://localhost:3000'],
  credentials: true
}));
app.use(cookieParser());
app.use(express.json());

// MongoDB Connection URI
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    await client.connect();

    // Database and Collections
    const database = client.db("skillswapDB");
    const usersCollection = database.collection("users");
    const tasksCollection = database.collection("tasks");
    const proposalsCollection = database.collection("proposals");
    const paymentsCollection = database.collection("payments");
    const reviewsCollection = database.collection("reviews");

    // Seed Hardcoded Admin Account if not exists
    const seedAdmin = async () => {
      const adminEmail = "admin1@taskhive.com";
      const existingAdmin = await usersCollection.findOne({ email: adminEmail });

      if (!existingAdmin) {
        const adminUser = {
          name: "TaskHive Admin",
          email: adminEmail,
          image: "https://i.ibb.co/6rW8pG7/admin-avatar.png",
          role: "admin",
          skills: ["System Administration", "Platform Management"],
          bio: "Platform Administrator for SkillSwap.",
          isBlocked: false,
          createdAt: new Date()
        };
        await usersCollection.insertOne(adminUser);
        console.log("Admin account seeded successfully: admin1@taskhive.com");
      }
    };

    await seedAdmin();

    // ----------------------------------------------------
    // Clean Modular Route Registrations
    // ----------------------------------------------------

    // 1. User Authentication & Profile Routes
    const userRoutes = require('./routes/userRoutes')(usersCollection);
    app.use('/api/users', userRoutes);

    // 2. Task Core Routes (Browse open tasks, my-tasks, create, edit, delete, featured)
    const taskRoutes = require('./routes/taskRoutes')(tasksCollection, proposalsCollection);
    app.use('/api/tasks', taskRoutes);

    // 3. Proposal Routes (Submit bids, accept-and-pay, reject, deliverable submit)
    const proposalRoutes = require('./routes/proposalRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/tasks', proposalRoutes);

    // 4. Freelancer Module (Top freelancers, update profile, stats, earnings, projects)
    const freelancerRoutes = require('./routes/freelancerRoutes')(usersCollection, tasksCollection, proposalsCollection);
    app.use('/api/tasks', freelancerRoutes);

    // 5. Admin Dashboard Routes (Stats, manage users, block/unblock)
    const adminRoutes = require('./routes/adminRoutes')(usersCollection, tasksCollection, paymentsCollection);
    app.use('/api/admin', adminRoutes);

    // 6. Payment & Review Routes
    const paymentRoutes = require('./routes/paymentRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/payments', paymentRoutes);

    const reviewRoutes = require('./routes/reviewRoutes')(reviewsCollection, tasksCollection);
    app.use('/api/reviews', reviewRoutes);

    // Ping to confirm deployment
    await database.command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send("SkillSwap Server is running successfully!");
});

app.listen(port, () => {
  console.log(`SkillSwap server is running on port ${port}`);
});