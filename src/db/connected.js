// const mongoose = require("mongoose");

// const connectDB = async () => {
//     try {
//         await mongoose.connect(process.env.MONGO_URI, {
//             dbName: process.env.DB_NAME
//         });

//         console.log("MongoDB connected successfully");
//         console.log("Database:", process.env.DB_NAME);

//     } catch (error) {
//         console.error("MongoDB connection failed:", error.message);
//         throw error;
//     }
// };

// module.exports = connectDB;



const mongoose=require("mongoose")
const{DB_Name}=require("../constant.js")

const connectedDB=async()=>{
    try {
        const InstanceConnection=await mongoose.connect(`${process.env.MONGO_URI}/${DB_Name}`)
        console.log(`mongoose is connected ${InstanceConnection.connection.host}`);

    } catch (error) {
        console.log(`mongoose are not connected`,error);
        
    }
}

module.exports={connectedDB}