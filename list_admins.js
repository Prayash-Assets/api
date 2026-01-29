
const mongoose = require('mongoose');
const User = require('./src/models/User').default;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function listOrgAdmins() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const admins = await User.find({ userType: 'OrgAdmin' }).limit(5);
        console.log('Org Admins:', admins);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

listOrgAdmins();
