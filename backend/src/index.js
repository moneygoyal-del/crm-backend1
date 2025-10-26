import app from "./app.js";
import {connectDB} from "./DB/db.js"
import 'dotenv/config'

//routers
import userRouter from "./routes/user.routes.js"
import doctorRouter from "./routes/doctor.routes.js"
import patientLeadRouter from "./routes/patientLeads.routes.js";

const port = process.env.PORT || 8000;

connectDB()
    .then(() => {
        app.use("/api/v1/users",userRouter);
        app.use("/api/v1/doctors",doctorRouter);
        app.use("/api/v1/patientLeads",patientLeadRouter);
        app.get("/", (req, res) => {
            res.send("Welcome to the Medpho CRM Backend API");
        });
        
        
        app.get("/api/v1/health", (req, res) => {
            res.status(200).json({
                message: "Server is Up and Running!",
                service: "medpho-crm-backend",
                timestamp: new Date().toISOString()
            });
        });
        // ---------------------------------

        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch((error) => {
        console.error("Error Connecting to Database ", error);
    })