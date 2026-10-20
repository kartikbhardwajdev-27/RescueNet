// const bcrypt = require("bcrypt");
// const jwt = require("jsonwebtoken");
// const User = require("../model/User.js");

// // =================================
// // REGISTER USER
// // =================================

// const registerUser = async (req, res) => {
//     try {
//         const {
//             name,
//             email,
//             phone,
//             password,
//             role,
//             location,
//             orgName,
//             orgType,
//             description,
//             contactInfo
//         } = req.body;

//         // Check required fields
//         if (!name || !email || !phone || !password) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Name, email, phone and password are required"
//             });
//         }

//         // Check password
//         if (typeof password !== "string" || password.length < 8) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Password must be at least 8 characters"
//             });
//         }

//         // Check role
//         const accountRole = role || "citizen";

//         if (!["citizen", "organization"].includes(accountRole)) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Invalid account role"
//             });
//         }

//         // Check organization fields
//         if (
//             accountRole === "organization" &&
//             (!orgName || !orgType)
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Organization name and type are required"
//             });
//         }

//         const normalizedEmail = email.trim().toLowerCase();

//         // Check existing user
//         const existingUser = await User.findOne({
//             email: normalizedEmail
//         });

//         if (existingUser) {
//             return res.status(409).json({
//                 success: false,
//                 message: "Email already registered"
//             });
//         }

//         // Hash password
//         const hashedPassword = await bcrypt.hash(password, 12);

//         // Create user
//         const user = await User.create({
//             name,
//             email: normalizedEmail,
//             phone,
//             password: hashedPassword,
//             role: accountRole,
//             location,
//             orgName: accountRole === "organization" ? orgName : undefined,
//             orgType: accountRole === "organization" ? orgType : undefined,
//             description: accountRole === "organization" ? description : undefined,
//             contactInfo: accountRole === "organization" ? contactInfo : undefined
//         });

//         return res.status(201).json({
//             success: true,
//             message: "Account created successfully",
//             user: {
//                 id: user._id,
//                 name: user.name,
//                 email: user.email,
//                 phone: user.phone,
//                 role: user.role,
//                 location: user.location,
//                 orgName: user.orgName,
//                 orgType: user.orgType,
//                 description: user.description,
//                 contactInfo: user.contactInfo
//             }
//         });

//     } catch (error) {
//         if (error.code === 11000) {
//             return res.status(409).json({
//                 success: false,
//                 message: "Email already registered"
//             });
//         }

//         if (error.name === "ValidationError") {
//             return res.status(400).json({
//                 success: false,
//                 message: error.message
//             });
//         }

//         console.error("Register error:", error.message);

//         return res.status(500).json({
//             success: false,
//             message: "Internal server error"
//         });
//     }
// };


// // =================================
// // LOGIN USER
// // =================================

// const loginUser = async (req, res) => {
//     try {
//         const { email, password } = req.body;

//         if (
//             typeof email !== "string" ||
//             !email.trim() ||
//             typeof password !== "string" ||
//             !password
//         ) {
//             return res.status(400).json({
//                 success: false,
//                 message: "Email and password are required"
//             });
//         }

//         // Find user and include password hash
//         const user = await User.findOne({
//             email: email.trim().toLowerCase()
//         }).select("+password");

//         if (!user) {
//             return res.status(401).json({
//                 success: false,
//                 message: "Invalid email or password"
//             });
//         }

//         // Verify password
//         const isMatch = await bcrypt.compare(
//             password,
//             user.password
//         );

//         if (!isMatch) {
//             return res.status(401).json({
//                 success: false,
//                 message: "Invalid email or password"
//             });
//         }

//         if (!process.env.JWT_SECRET) {
//             throw new Error("JWT_SECRET is not configured");
//         }

//         // Generate JWT token
//         const token = jwt.sign(
//             {
//                 userId: user._id.toString(),
//                 role: user.role
//             },
//             process.env.JWT_SECRET,
//             {
//                 expiresIn: "1d"
//             }
//         );

//         return res.status(200).json({
//             success: true,
//             message: "Login successful",
//             token,
//             user: {
//                 id: user._id,
//                 name: user.name,
//                 email: user.email,
//                 phone: user.phone,
//                 role: user.role,
//                 location: user.location,
//                 orgName: user.orgName,
//                 orgType: user.orgType,
//                 description: user.description,
//                 contactInfo: user.contactInfo
//             }
//         });

//     } catch (error) {
//         console.error("Login error:", error.message);

//         return res.status(500).json({
//             success: false,
//             message: "Internal server error"
//         });
//     }
// };

// module.exports = {
//     registerUser,
//     loginUser
// };