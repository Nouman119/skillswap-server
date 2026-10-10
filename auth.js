const { betterAuth } = require("better-auth");
const { mongodbAdapter } = require("better-auth/adapters/mongodb");
const { MongoClient } = require("mongodb");

const uri = process.env.MONGODB_URI;
if (!uri) {
  throw new Error("Please add your MONGODB_URI to environment variables");
}

const client = new MongoClient(uri);
const db = client.db();

const auth = betterAuth({
  database: mongodbAdapter(db),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL || "https://skillswap-server-wgm3.onrender.com",
  trustedOrigins: [
    "http://localhost:3000",
    "https://skillswap-client-five.vercel.app"
  ],
  
  // Cross-domain cookie settings for Vercel & Render
  advanced: {
    useSecureCookies: true,
    // Disable CSRF strict check if cross-origin requests block the state token
    disableCSRFCheck: false, 
  },
  cookies: {
    sessionToken: {
      attributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    // Ensure state cookie also uses sameSite none for OAuth flow
    state: {
      attributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    }
  },

  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      prompt: "select_account",
    },
  },

  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "client",
        input: true,
      },
    },
  },
});

module.exports = { auth };