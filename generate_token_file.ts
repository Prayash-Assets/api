
import mongoose from 'mongoose';
import User from './src/models/User';
import jwt from 'jsonwebtoken';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
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

        fs.writeFileSync('token.txt', token, 'utf8');
        fs.writeFileSync('user.json', JSON.stringify(admin), 'utf8');

        console.log("Written to files.");

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

generateOrgToken();
