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
app.use(cookieParser());app.use(express.json());

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
    // Connect the client to the server
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

    // Register user routes
    const userRoutes = require('./routes/userRoutes')(usersCollection);
    app.use('/api/users', userRoutes);

    // Register task routes with all required collections
    const taskRoutes = require('./routes/taskRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/tasks', taskRoutes);

    // Register payment routes
    const paymentRoutes = require('./routes/paymentRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/payments', paymentRoutes);

    // Register review routes
    const reviewRoutes = require('./routes/reviewRoutes')(reviewsCollection, tasksCollection);
    app.use('/api/reviews', reviewRoutes);

    // Ping to confirm a successful connection
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