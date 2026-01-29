// Script to fix referral data corruption from old percentage-based settings
// This script corrects ReferralUsage records that were created with wrong benefitType

const mongoose = require('mongoose');
require('dotenv').config();

const ReferralSettingsSchema = new mongoose.Schema({
    discountType: String,
    referrerBenefit: Number,
    refereeBenefit: Number,
    isActive: Boolean,
});

const ReferralUsageSchema = new mongoose.Schema({
    referrer: mongoose.Schema.Types.ObjectId,
    referee: mongoose.Schema.Types.ObjectId,
    referralCode: String,
    status: String,
    benefitType: String,
    referrerBenefitValue: Number,
    referrerCreditAmount: Number,
    refeeDiscountAmount: Number,
    purchaseAmount: Number,
    createdAt: Date,
    completedAt: Date,
});

const UserSchema = new mongoose.Schema({
    fullname: String,
    email: String,
    referralCode: String,
    referralCount: Number,
    referralCredits: Number,
});

const ReferralSettings = mongoose.model('ReferralSettings', ReferralSettingsSchema);
const ReferralUsage = mongoose.model('ReferralUsage', ReferralUsageSchema);
const User = mongoose.model('User', UserSchema);

async function fixReferralData() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // 1. Check and fix ReferralSettings
        console.log('\n=== Checking ReferralSettings ===');
        const settings = await ReferralSettings.findOne();
        if (settings) {
            console.log('Current ReferralSettings:');
            console.log({
                discountType: settings.discountType,
                referrerBenefit: settings.referrerBenefit,
                refereeBenefit: settings.refereeBenefit,
                isActive: settings.isActive,
            });

            if (settings.discountType !== 'flat' || settings.referrerBenefit !== 100) {
                console.log('\n⚠️  Settings need fixing!');
                console.log('Updating to: discountType="flat", referrerBenefit=100');
                await ReferralSettings.updateOne({}, {
                    discountType: 'flat',
                    referrerBenefit: 100,
                    refereeBenefit: 10,
                    isActive: true,
                });
                console.log('✅ Settings updated');
            } else {
                console.log('✅ Settings are correct');
            }
        } else {
            console.log('⚠️  No ReferralSettings found, creating default');
            await ReferralSettings.create({
                discountType: 'flat',
                referrerBenefit: 100,
                refereeBenefit: 10,
                isActive: true,
            });
            console.log('✅ Default settings created');
        }

        // 2. Fix incorrect ReferralUsage records
        console.log('\n=== Checking ReferralUsage Records ===');
        const incorrectRecords = await ReferralUsage.find({
            benefitType: 'percentage',
            referrerBenefitValue: 100,
        });

        if (incorrectRecords.length > 0) {
            console.log(`Found ${incorrectRecords.length} records with percentage-based benefit (wrong!)`);
            for (const record of incorrectRecords) {
                console.log(`\nRecord: ${record._id}`);
                console.log(`  Referrer: ${record.referrer}`);
                console.log(`  Purchase Amount: ₹${record.purchaseAmount}`);
                console.log(`  Current Credit Amount: ₹${record.referrerCreditAmount} (100% of purchase - WRONG!)`);
                console.log(`  Should be: ₹100 (flat benefit)`);

                // Update to correct flat benefit
                await ReferralUsage.updateOne(
                    { _id: record._id },
                    {
                        benefitType: 'flat',
                        referrerBenefitValue: 100,
                        referrerCreditAmount: 100, // Fixed to 100 rupees, not percentage
                    }
                );
                console.log(`  ✅ Updated to flat benefit of ₹100`);

                // Also update user's referralCredits
                if (record.status === 'completed' && record.referrer) {
                    const user = await User.findById(record.referrer);
                    if (user) {
                        // Recalculate: sum all completed ReferralUsage for this user
                        const totalCompleted = await ReferralUsage.aggregate([
                            { $match: { referrer: record.referrer, status: 'completed' } },
                            { $group: { _id: null, total: { $sum: '$referrerCreditAmount' } } }
                        ]);
                        const correctTotal = totalCompleted[0]?.total || 0;
                        console.log(`  User ${user.email}: referralCredits ${user.referralCredits} → ${correctTotal}`);
                        await User.updateOne(
                            { _id: record.referrer },
                            { referralCredits: correctTotal }
                        );
                    }
                }
            }
        } else {
            console.log('✅ No incorrect percentage-based records found');
        }

        // 3. Verify all users' referralCredits are correct
        console.log('\n=== Verifying User referralCredits ===');
        const users = await User.find({ referralCredits: { $gt: 0 } });
        for (const user of users) {
            const correctCredits = await ReferralUsage.aggregate([
                { $match: { referrer: user._id, status: 'completed' } },
                { $group: { _id: null, total: { $sum: '$referrerCreditAmount' } } }
            ]);
            const expected = correctCredits[0]?.total || 0;
            if (user.referralCredits !== expected) {
                console.log(`⚠️  User ${user.email}: referralCredits=${user.referralCredits}, should be ${expected}`);
                await User.updateOne(
                    { _id: user._id },
                    { referralCredits: expected }
                );
                console.log(`  ✅ Fixed`);
            } else {
                console.log(`✅ User ${user.email}: referralCredits=${user.referralCredits} (correct)`);
            }
        }

        console.log('\n=== Done ===\n');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixReferralData();
