require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express();
const port = process.env.PORT || 5000;

// CORS configuration supporting production Vercel deployment and local development
const allowedOrigins = [
  process.env.CLIENT_URL,
  'http://localhost:3000',
  'https://skillswap-client-five.vercel.app'
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server requests or matching client origin
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Fallback to allow client requests without CORS lock
    }
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// Basic health check route for Render
app.get('/', (req, res) => {
  res.send('SkillSwap API Server is running successfully!');
});

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
      try {
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
      } catch (seedErr) {
        console.error("Admin seeding error:", seedErr);
      }
    };

    await seedAdmin();

    // ----------------------------------------------------
    // Clean Modular Route Registrations
    // ----------------------------------------------------

    // 1. User Authentication & Profile Routes
    const userRoutes = require('./routes/userRoutes')(usersCollection);
    app.use('/api/users', userRoutes);

    // Direct User & Freelancer Profile Update Route
    const handleProfileUpdate = async (req, res) => {
      try {
        const { email, name, image, skills, bio, hourlyRate } = req.body;

        if (!email) {
          return res.status(400).json({ error: "User email is required" });
        }

        const updateFields = { updatedAt: new Date() };
        if (name !== undefined) updateFields.name = name.trim();
        if (image !== undefined) updateFields.image = image.trim();
        if (bio !== undefined) updateFields.bio = bio.trim();
        if (hourlyRate !== undefined) updateFields.hourlyRate = Number(hourlyRate) || 0;

        if (skills !== undefined) {
          updateFields.skills = Array.isArray(skills)
            ? skills
            : String(skills).split(',').map((s) => s.trim()).filter(Boolean);
        }

        const result = await usersCollection.updateOne(
          { email: email },
          { $set: updateFields }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ error: "User not found with this email" });
        }

        return res.json({ success: true, message: "Profile updated successfully" });
      } catch (error) {
        console.error("Direct profile update error:", error);
        return res.status(500).json({ error: error.message });
      }
    };

    app.put('/api/users/profile', handleProfileUpdate);
    app.patch('/api/users/profile', handleProfileUpdate);

    // 2. Task Core Routes
    const taskRoutes = require('./routes/taskRoutes')(tasksCollection, proposalsCollection);
    app.use('/api/tasks', taskRoutes);

    // 3. Proposal Routes
    const proposalRoutes = require('./routes/proposalRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/tasks', proposalRoutes);

    // 4. Freelancer Module
    const freelancerRoutes = require('./routes/freelancerRoutes')(usersCollection, tasksCollection, proposalsCollection);
    app.use('/api/tasks', freelancerRoutes);

    // 5. Admin Dashboard Routes
    const adminRoutes = require('./routes/adminRoutes')(usersCollection, tasksCollection, paymentsCollection);
    app.use('/api/admin', adminRoutes);

    // 6. Payment & Review Routes
    const paymentRoutes = require('./routes/paymentRoutes')(tasksCollection, proposalsCollection, paymentsCollection);
    app.use('/api/payments', paymentRoutes);

    const reviewRoutes = require('./routes/reviewRoutes')(reviewsCollection, tasksCollection);
    app.use('/api/reviews', reviewRoutes);

    // Ping confirmation
    await database.command({ ping: 1 });
    console.log("Successfully connected to MongoDB!");
  } catch (error) {
    console.error("Database connection error:", error);
  }
}

// Execute database connection asynchronously
run().catch(console.dir);

// Start server immediately to bind port and satisfy Render port scanner
app.listen(port, "0.0.0.0", () => {
  console.log(`Server is running on port: ${port}`);
});