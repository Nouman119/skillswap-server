require("dotenv").config();
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is missing in environment variables.");
  process.exit(1);
}

const client = new MongoClient(uri);

async function seedDatabase() {
  try {
    await client.connect();
    const db = client.db("skillswapDB");
    const usersCollection = db.collection("users");
    const tasksCollection = db.collection("tasks");

    console.log("Connected to MongoDB for seeding...");

    // ----------------------------------------------------
    // Seed Real Freelancer Accounts
    // ----------------------------------------------------
    const freelancers = [
      {
        name: "Tanvir Rahman",
        email: "tanvir.dev@example.com",
        image: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
        role: "freelancer",
        skills: ["React", "Next.js", "Node.js", "TypeScript"],
        rating: 4.95,
        completedJobs: 28,
        hourlyRate: 45,
        bio: "Senior Full Stack JavaScript Developer with 5+ years of production experience.",
        isBlocked: false,
        createdAt: new Date(),
      },
      {
        name: "Ayesha Siddiqua",
        email: "ayesha.ui@example.com",
        image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=400&q=80",
        role: "freelancer",
        skills: ["Figma", "UI/UX Design", "Wireframing", "Tailwind CSS"],
        rating: 4.9,
        completedJobs: 34,
        hourlyRate: 40,
        bio: "Product Designer passionate about building clean, accessible digital interfaces.",
        isBlocked: false,
        createdAt: new Date(),
      },
      {
        name: "Mahmud Hasan",
        email: "mahmud.backend@example.com",
        image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80",
        role: "freelancer",
        skills: ["Node.js", "Express", "MongoDB", "Docker", "AWS"],
        rating: 4.88,
        completedJobs: 19,
        hourlyRate: 50,
        bio: "Backend specialist focusing on scalable architectures, microservices and secure APIs.",
        isBlocked: false,
        createdAt: new Date(),
      },
      {
        name: "Farhana Islam",
        email: "farhana.mobile@example.com",
        image: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=400&q=80",
        role: "freelancer",
        skills: ["React Native", "Flutter", "Firebase", "Mobile UI"],
        rating: 4.85,
        completedJobs: 22,
        hourlyRate: 42,
        bio: "Cross-platform mobile application engineer delivering responsive iOS & Android apps.",
        isBlocked: false,
        createdAt: new Date(),
      },
    ];

    for (const f of freelancers) {
      await usersCollection.updateOne(
        { email: f.email },
        { $set: f },
        { upsert: true }
      );
    }
    console.log("Freelancers seeded successfully.");

    // ----------------------------------------------------
    // Seed Real Client & Initial Tasks
    // ----------------------------------------------------
    const initialTasks = [
      {
        title: "Full Stack Dashboard Development with Next.js",
        description: "Need an experienced engineer to build an interactive administrative analytics dashboard with dark mode and role-based permissions.",
        category: "Development",
        budget: 650,
        deadline: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000), // 10 days from now
        status: "open",
        isFeatured: true,
        clientEmail: "corporate.client@example.com",
        clientName: "Enterprise Labs Ltd.",
        proposalsCount: 3,
        createdAt: new Date(),
      },
      {
        title: "Figma UI/UX Redesign for E-commerce Mobile App",
        description: "Looking for a seasoned product designer to revamp our checkout workflow, product cards, and profile screens for higher conversion.",
        category: "Design",
        budget: 400,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: "open",
        isFeatured: true,
        clientEmail: "corporate.client@example.com",
        clientName: "Enterprise Labs Ltd.",
        proposalsCount: 5,
        createdAt: new Date(),
      },
      {
        title: "RESTful API Integration with Stripe Payments",
        description: "Build secure Express.js endpoints to manage subscription checkouts, webhook listeners, and automated invoicing.",
        category: "Development",
        budget: 500,
        deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        status: "open",
        isFeatured: true,
        clientEmail: "corporate.client@example.com",
        clientName: "Enterprise Labs Ltd.",
        proposalsCount: 2,
        createdAt: new Date(),
      },
    ];

    for (const task of initialTasks) {
      await tasksCollection.updateOne(
        { title: task.title },
        { $set: task },
        { upsert: true }
      );
    }
    console.log("Tasks seeded successfully.");

    console.log("All seed data inserted cleanly into MongoDB.");
  } catch (error) {
    console.error("Seeding failed:", error);
  } finally {
    await client.close();
    process.exit(0);
  }
}

seedDatabase();