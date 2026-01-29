import mongoose from "mongoose";
import dotenv from "dotenv";
import User from "../models/User";
import { generateReferralCode } from "../utils/referralUtils";

dotenv.config();

const generateCodes = async () => {
    try {
        if (!process.env.MONGODB_URI) {
            throw new Error("MONGODB_URI is not defined");
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB");

        // We want to find students who EITHER don't have the field OR have it as null/undefined
        const students = await User.find({
            userType: "Student",
            $or: [
                { referralCode: { $exists: false } },
                { referralCode: null },
                { referralCode: "" }
            ]
        });

        console.log(`Found ${students.length} students without valid referral codes.`);

        let updatedCount = 0;
        for (const s of students) {
            const student = s as any;
            try {
                // Generate unique code
                const code = await generateReferralCode();

                student.referralCode = code;
                student.referralCount = 0;
                student.referralCredits = 0;

                await student.save();
                updatedCount++;

                if (updatedCount % 50 === 0) {
                    process.stdout.write(`.`);
                }
            } catch (err) {
                console.error(`\nFailed to update student ${student._id}:`, err);
            }
        }

        console.log(`\nSuccessfully generated referral codes for ${updatedCount} students.`);
        process.exit(0);
    } catch (error) {
        console.error("Error generating referral codes:", error);
        process.exit(1);
    }
};

generateCodes();
