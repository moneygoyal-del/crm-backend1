import app from "./app.js";
import {connectDB,pool} from "./DB/db.js"
import 'dotenv/config'

const port = process.env.PORT || 8000;

connectDB()
    .then(() => {
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error("Error Connecting to Database ", error);
    })