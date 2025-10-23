import {Pool} from "pg"
import 'dotenv/config'

const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: process.env.POSTGRES_HOST,
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: process.env.POSTGRES_PORT,
});

const connectDB = async () => {
    try {
        pool.connect((err, client, release) => {
            if (err) {
                return console.error("Error acquiring client", err.stack);
            }

           
            client.query("SET search_path TO crm, public;", (err) => {
                if (err) {
                    console.error("Error setting search_path:", err.stack);
                    release();
                    return;
                }
                console.log("Successfully connected to PostgreSQL database.");
                release();
            });
            // ----------------------------------------
            
        });
    } catch (error) {
        console.error("ERROR: ", error);
        // process.exit(1);
        throw error;
    }
};

export  {connectDB,pool};