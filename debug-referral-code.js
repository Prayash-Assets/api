// Debug script to check referral codes in database
const mongoose = require('mongoose');
require('dotenv').config();

async function debugReferralCodes() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB\n');

        const UserSchema = new mongoose.Schema({}, { discriminatorKey: 'userType', collection: 'users' });
        const User = mongoose.model('User', UserSchema);

        // Find all students with referral codes
        const studentsWithCodes = await User.find({
            userType: 'Student',
            referralCode: { $exists: true, $ne: null }
        }).select('fullname email referralCode referralCount referralCredits userType');

        console.log('=== Students with Referral Codes ===\n');
        if (studentsWithCodes.length === 0) {
            console.log('❌ No students found with referral codes!');
        } else {
            studentsWithCodes.forEach((student, idx) => {
                console.log(`${idx + 1}. ${student.fullname} (${student.email})`);
                console.log(`   Referral Code: "${student.referralCode}"`);
                console.log(`   Code Length: ${student.referralCode ? student.referralCode.length : 'N/A'}`);
                console.log(`   Code Type: ${typeof student.referralCode}`);
                console.log(`   Referral Count: ${student.referralCount || 0}`);
                console.log(`   Referral Credits: ${student.referralCredits || 0}`);
                console.log();
            });
        }

        // Try to find Daniel specifically
        console.log('=== Searching for Daniel ===\n');
        const daniel = await User.findOne({
            fullname: { $regex: 'Daniel', $options: 'i' },
            userType: 'Student'
        }).select('fullname email referralCode');

        if (daniel) {
            console.log(`Found: ${daniel.fullname} (${daniel.email})`);
            console.log(`Referral Code: "${daniel.referralCode}"`);
            console.log(`Code exists: ${!!daniel.referralCode}`);
            if (daniel.referralCode) {
                console.log(`Code uppercase: ${daniel.referralCode.toUpperCase()}`);
                console.log(`Code length: ${daniel.referralCode.length}`);
            }
        } else {
            console.log('❌ Daniel not found');
        }

        // Try to find by specific code
        console.log('\n=== Searching for code "GCTHHXBT" ===\n');
        const byCode = await User.findOne({
            referralCode: 'GCTHHXBT',
            userType: 'Student'
        }).select('fullname email referralCode');

        if (byCode) {
            console.log(`✅ Found: ${byCode.fullname}`);
        } else {
            console.log('❌ Code "GCTHHXBT" not found in database');
            
            // Try case-insensitive search
            console.log('\nTrying case-insensitive search...');
            const byCodeCaseInsensitive = await User.findOne({
                referralCode: { $regex: '^GCTHHXBT$', $options: 'i' },
                userType: 'Student'
            }).select('fullname email referralCode');
            
            if (byCodeCaseInsensitive) {
                console.log(`✅ Found with case-insensitive: ${byCodeCaseInsensitive.fullname}`);
                console.log(`   Actual code in DB: "${byCodeCaseInsensitive.referralCode}"`);
            } else {
                console.log('❌ Still not found even with case-insensitive search');
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

debugReferralCodes();
