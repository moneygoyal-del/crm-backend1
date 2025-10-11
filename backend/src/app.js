import express from "express";
import cors from "cors";
// import cookieParser from "cookie-parser";

const app = express();

//Cors option will be used later
// var whitelist = []
// var corsOptions = {
//   origin: function (origin, callback) {
//     console.log(origin);
//     if (!origin || whitelist.indexOf(origin) !== -1) {
//       callback(null, true)
//     } else {
//       callback(new Error('Not allowed by CORS'))
//     }
//   },
//   credentials: true
// }

app.use(cors());

app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static("public")); // for future use if needed

// app.use(cookieParser());

export default app;
