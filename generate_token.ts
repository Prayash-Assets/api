
import mongoose from 'mongoose';
import User from './src/models/User';
import jwt from 'jsonwebtoken';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '.env') });

async function generateOrgToken() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);

        // Find an OrgAdmin
        const admin = await User.findOne({ userType: 'OrgAdmin' }).sort({ createdAt: -1 });

        if (!admin) {
            console.log("No OrgAdmin found.");
            process.exit(1);
        }

        // Generate Token
        const payload = {
            id: admin._id,
            fullname: admin.fullname,
            email: admin.email,
            userType: admin.userType,
            organization: (admin as any).organization
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key", { expiresIn: '1d' });

        console.log("ORG_ADMIN_TOKEN:", token);
        console.log("ORG_ADMIN_User:", JSON.stringify(admin));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

generateOrgToken();
