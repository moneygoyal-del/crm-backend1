import {Pool} from "pg"
import 'dotenv/config'

// --- START FIX for "SSL/TLS required" ---

// 1. Base config for all environments
const dbConfig = {
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT,
    options: `-c search_path=crm,public`
};

// 2. If NODE_ENV is "production" (like on Render), enable SSL
if (process.env.NODE_ENV === "production") {
  dbConfig.ssl = {
    rejectUnauthorized: false
  };
}

// 3. Create the pool with our new dynamic config
const pool = new Pool(dbConfig);

// --- END FIX ---


const connectDB = async () => {
    try {
        pool.connect((err, client, release) => {
            if (err) {
                return console.error("Error acquiring client", err.stack);
            }
            // Remove the previous manual SET search_path logic here if you added it, 
            // and replace it with a simple check.
            console.log("Successfully connected to PostgreSQL database!");
            release();
        });
    } catch (error) {
        console.error("ERROR: ", error);
        // process.exit(1);
        throw error;
    }
};

export  {connectDB,pool};
