const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/prayashassets';

const client = new MongoClient(uri);

async function dropIndex() {
  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');
    
    const db = client.db('prayashassets');
    const commissions = db.collection('commissions');
    
    // List all indexes
    const indexes = await commissions.listIndexes().toArray();
    console.log('\n📋 Current indexes:');
    indexes.forEach(idx => console.log(`  - ${JSON.stringify(idx.key)}`));
    
    // Drop the problematic unique index
    const indexToDrop = 'organization_1_period.startDate_1_period.endDate_1_period.type_1';
    try {
      await commissions.dropIndex(indexToDrop);
      console.log(`\n✅ Dropped unique index: ${indexToDrop}`);
    } catch (dropErr) {
      if (dropErr.message.includes('index not found')) {
        console.log(`\nℹ️ Index "${indexToDrop}" not found (already removed or doesn't exist)`);
      } else {
        throw dropErr;
      }
    }
    
    // Show remaining indexes
    const newIndexes = await commissions.listIndexes().toArray();
    console.log('\n📋 Remaining indexes after drop:');
    newIndexes.forEach(idx => console.log(`  - ${JSON.stringify(idx.key)}`));
    
    await client.close();
    console.log('\n✅ Done');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

dropIndex();
