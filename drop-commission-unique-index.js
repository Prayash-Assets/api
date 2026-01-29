/**
 * Database Migration Script
 * 
 * Purpose: Drop the unique compound index on Commission collection to allow
 * per-purchase commission tracking instead of period-based aggregation
 * 
 * This migration is required after fixing the commission tracking bug where
 * new purchases were incorrectly merged into existing commission records.
 * 
 * Run this script ONCE after deploying the code changes to ensure the database
 * schema matches the new per-purchase commission logic.
 */

const mongoose = require('mongoose');
require('dotenv').config();

async function dropCommissionUniqueIndex() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const commissionsCollection = db.collection('commissions');

    console.log('\n📋 Current indexes on commissions collection:');
    const indexes = await commissionsCollection.indexes();
    indexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, JSON.stringify(index.key));
    });

    // Find the unique compound index
    const uniqueIndex = indexes.find(idx => 
      idx.name.includes('organization') && 
      idx.name.includes('period') &&
      idx.unique === true
    );

    if (uniqueIndex) {
      console.log(`\n🗑️ Dropping unique index: ${uniqueIndex.name}`);
      await commissionsCollection.dropIndex(uniqueIndex.name);
      console.log('✅ Unique index dropped successfully');
    } else {
      console.log('\nℹ️ No unique compound index found - may already be dropped');
    }

    console.log('\n📋 Updated indexes on commissions collection:');
    const updatedIndexes = await commissionsCollection.indexes();
    updatedIndexes.forEach((index, i) => {
      console.log(`${i + 1}. ${index.name}:`, JSON.stringify(index.key));
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📝 Note: Existing commission records with multiple purchases will remain as-is.');
    console.log('   New purchases will create separate commission records going forward.');
    console.log('   You may manually split old records if needed for cleaner data.');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
    process.exit(0);
  }
}

dropCommissionUniqueIndex();
