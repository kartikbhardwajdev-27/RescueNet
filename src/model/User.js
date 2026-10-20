// const mongoose = require("mongoose");

// const userSchema = new mongoose.Schema(
//     {
//         name: {
//             type: String,
//             required: true,
//             trim: true
//         },

//         email: {
//             type: String,
//             required: true,
//             unique: true,
//             lowercase: true,
//             trim: true
//         },

//         phone: {
//             type: String,
//             required: true,
//             trim: true
//         },

//         password: {
//             type: String,
//             required: true,
//             select: false
//         },

//         role: {
//             type: String,
//             enum: ["citizen", "organization"],
//             default: "citizen",
//             required: true
//         },

//         location: {
//             type: String,
//             default: ""
//         },

//         orgName: {
//             type: String,
//             trim: true,
//             required: function () {
//                 return this.role === "organization";
//             }
//         },

//         orgType: {
//             type: String,
//             enum: ["NGO", "govt", "volunteer group"],
//             required: function () {
//                 return this.role === "organization";
//             }
//         },

//         description: {
//             type: String,
//             default: ""
//         },

//         contactInfo: {
//             type: String,
//             default: ""
//         }
//     },
//     {
//         timestamps: true
//     }
// );

// module.exports = mongoose.model("User", userSchema);