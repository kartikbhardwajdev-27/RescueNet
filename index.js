// require('dotenv').config();
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');

// const app = express();
// app.use(cors());
// app.use(express.json());

// const PORT = process.env.PORT || 5000;
// const MONGO_URI = process.env.MONGO_URI;

// mongoose.connect(MONGO_URI)
//   .then(() => console.log('MongoDB connected'))
//   .catch((err) => console.error('MongoDB connection error:', err));

// app.get('/', (req, res) => {
//   res.send('RescueNet API is running');
// });

// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });


// require("dotenv").config();

// const express = require("express");
// const cors = require("cors");

// const connectDB = require("./src/db/connected.js");
// const authRoutes = require("./src/routes/authRoutes.js");;

// const app = express();

// const PORT = process.env.PORT || 5000;

// // Middleware
// app.use(cors({
//     origin: process.env.CLIENT_ORIGIN || "http://127.0.0.1:5500"
// }));

// app.use(express.json());

// // Test route
// app.get("/", (req, res) => {
//     res.send("RescueNet API is running");
// });

// // Authentication routes
// app.use("/api/auth", authRoutes);

// // Connect database and start server
// const startServer = async () => {
//     try {
//         await connectDB();

//         app.listen(PORT, () => {
//             console.log(`Server running on port ${PORT}`);
//         });
//     } catch (error) {
//         console.error("Server startup failed:", error.message);
//         process.exit(1);
//     }
// };

// startServer();







// const express = require("express");
// const cors = require("cors");
// const dotenv = require("dotenv");

// dotenv.config({ path: "./.env" });

// const { connectedDB } = require("./src/db/connected.js");

// const app = express();
// const port = process.env.PORT || 4000;

// app.use(express.json());
// app.use(cors());

// const startServer = async () => {
//   try {
//     console.log(
//       "MONGO_URI loaded:",
//       Boolean(process.env.MONGO_URI)
//     );

//     await connectedDB();

//     app.listen(port, () => {
//       console.log(`Server is running on port ${port}`);
//     });
//   } catch (error) {
//     console.error("Database/Server error:", error.message);
//   }
// };

// startServer();




const express=require("express")
const cors=require("cors")
const {connectedDB}=require("./src/db/connected.js")

const dotenv=require("dotenv")
const app=express()

dotenv.config({
    path:"./.env"
})
const port=process.env.PORT || 8000;
app.use(express.json())

connectedDB()
.then(()=>{
    app.listen(port,()=>{
        console.log(`port are connected ${port}`);
        
    })
}).catch((err)=>{
    console.log("server are failed",err);
    
})