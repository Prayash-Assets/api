
import mongoose from 'mongoose';
import User from './src/models/User';
import jwt from 'jsonwebtoken';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: path.join(__dirname, '.env') });

async function generateAdminToken() {
    try {
        await mongoose.connect(process.env.MONGODB_URI as string);

        // Find an Admin
        const admin = await User.findOne({ userType: 'Admin' });

        if (!admin) {
            console.log("No Admin found.");
            process.exit(1);
        }

        // Generate Token
        const payload = {
            id: admin._id,
            fullname: admin.fullname,
            email: admin.email,
            userType: admin.userType
        };

        const token = jwt.sign(payload, process.env.JWT_SECRET || "your-secret-key", { expiresIn: '1d' });

        fs.writeFileSync('admin_token.txt', token, 'utf8');
        fs.writeFileSync('admin_user.json', JSON.stringify(admin), 'utf8');

        console.log("Written to admin_token.txt and admin_user.json");

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

generateAdminToken();
