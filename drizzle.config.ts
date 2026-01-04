import { defineConfig } from "drizzle-kit";

// Retrieve the connection string from environment variables
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to run drizzle commands");
}

export default defineConfig({
  // FIX: Updated path to match your project structure
  schema: "./drizzle/schema.ts", 
  // Directory where migration files will be generated
  out: "./drizzle",
  // Set dialect to mysql for your local setup
  dialect: "mysql", 
  dbCredentials: {
    // Pass the connection URL directly from your .env file
    url: connectionString, 
  },
});