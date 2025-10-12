import app from "./app.js";
import {connectDB} from "./DB/db.js"
import 'dotenv/config'

//routers
import userRouter from "./routes/user.routes.js"
import doctorRouter from "./routes/doctor.routes.js"

const port = process.env.PORT || 8000;

connectDB()
    .then(() => {
        app.use("/api/v1/users",userRouter);
        app.use("/api/v1/doctors",doctorRouter);

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error("Error Connecting to Database ", error);
    })