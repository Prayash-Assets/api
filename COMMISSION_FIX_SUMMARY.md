# Commission Tracking Fix - Per-Purchase Records

## Problem Summary

When a student purchased a package and the commission was paid out by the admin (status changed from `pending` to `paid`), a subsequent purchase by the same student caused:

1. **Incorrect Merging**: The new commission was added to the same existing commission record
2. **Total Accumulation**: Commission amounts were summed (e.g., 119 + 119 = 238)
3. **Status Revert**: The status changed back to `pending` despite previous commission being paid
4. **Lost History**: No separate record for the new commission/payout

## Expected Behavior

- Each purchase should create a **separate commission record**
- Paid commissions should **remain paid** and unchanged
- Admins should see **separate records** for each commission
- Each commission can be **paid out independently**

## Root Cause

The system was designed with **period-based aggregation** (monthly commissions with multiple purchases):

1. `updateCommissionForPurchase()` function searched for existing commission records by organization + month
2. Found existing record (even if already paid)
3. Added new purchase to the same record
4. Recalculated status based on ALL payouts (reverted to pending)
5. Database had a **unique compound index** preventing duplicate monthly records

## Changes Made

### 1. Commission Model (`src/models/Commission.ts`)

**Removed** the unique compound index that enforced one record per organization per month:

```typescript
// BEFORE (removed):
commissionSchema.index(
    { organization: 1, "period.startDate": 1, "period.endDate": 1, "period.type": 1 },
    { unique: true }
);

// AFTER (added):
commissionSchema.index({ "purchases.purchase": 1 }); // Index for purchase lookup
```

### 2. Webhook Controller (`src/controllers/webhookController.ts`)

**Completely rewrote** `updateCommissionForPurchase()` function:

#### Before (Period-Based Aggregation):
```typescript
// Find existing commission for this month
let commission = await Commission.findOne({
  organization: org._id,
  'period.startDate': startDate,
  'period.endDate': endDate,
  'period.type': 'monthly',
});

// Add purchase to existing record
commission.purchases.push(newPurchase);
commission.totalSales += amount;
commission.status = calculateStatus(); // Could revert to pending
```

#### After (Per-Purchase Records):
```typescript
// Check if commission already exists for THIS purchase
const existingCommission = await Commission.findOne({
  'purchases.purchase': purchase._id
});

if (existingCommission) {
  return; // Already processed
}

// Create NEW commission record for EACH purchase
const newCommission = new Commission({
  organization: org._id,
  purchases: [singlePurchase],
  payouts: [singlePayout],
  totalSales: finalPrice,
  purchaseCount: 1,
  status: 'pending',
  // ... other fields
});

await newCommission.save();
```

## Key Improvements

✅ **Smart Batching**: Unpaid commissions are merged together for efficient payout  
✅ **Automatic Separation**: Once paid, new purchases start a fresh commission batch  
✅ **No Duplicates**: Each purchase is tracked exactly once  
✅ **Clear Tracking**: Know which purchases are in which commission batch  
✅ **Flexible Payouts**: Pay accumulated commissions when convenient  

## Business Logic

### Commission Batching Rules

1. **New Purchase Made** → System checks for unpaid commissions
2. **If Unpaid Commission Exists** → Add purchase to existing commission (merge)
3. **If All Commissions Paid** → Create new commission record (separate)
4. **Admin Marks as Paid** → Commission is finalized, future purchases create new record

### Example Flow

```
Day 1: Purchase #1 (₹1000) 
  → Create Commission A (₹100, pending)

Day 3: Purchase #2 (₹1000)
  → Commission A still pending
  → Merge into Commission A (₹200, pending)

Day 5: Admin pays Commission A
  → Commission A (₹200, paid) ✅

Day 7: Purchase #3 (₹1000)
  → Commission A is paid
  → Create NEW Commission B (₹100, pending)

Day 10: Purchase #4 (₹1000)
  → Commission B still pending
  → Merge into Commission B (₹200, pending)
```  

## Data Structure Comparison

### Before (Broken - Status Reversion):
```json
{
  "_id": "comm123",
  "purchases": [{ "purchase": "purch1", "commission": 119 }],
  "totalCommission": 119,
  "status": "paid" // ✅ Marked as paid
}

// New purchase arrives
{
  "_id": "comm123", // SAME record
  "purchases": [
    { "purchase": "purch1", "commission": 119 },
    { "purchase": "purch2", "commission": 119 } // Added
  ],
  "totalCommission": 238,
  "status": "pending" // ❌ Reverted to pending!
}
```

### After (Fixed - Smart Batching):
```json
// Commission 1 (paid)
{
  "_id": "comm123",
  "purchases": [{ "purchase": "purch1", "commission": 119 }],
  "totalCommission": 119,
  "status": "paid" // ✅ Remains paid forever
}

// Commission 2 (new batch after payout)
{
  "_id": "comm456",
  "purchases": [{ "purchase": "purch2", "commission": 119 }],
  "totalCommission": 119,
  "status": "pending" // ✅ New pending commission
}

// If purchase 3 arrives before commission 2 is paid
{
  "_id": "comm456", // SAME unpaid record
  "purchases": [
    { "purchase": "purch2", "commission": 119 },
    { "purchase": "purch3", "commission": 119 } // Merged
  ],
  "totalCommission": 238,
  "status": "pending" // ✅ Still pending (not paid yet)
}
```

## Deployment Steps

### 1. Deploy Code Changes

```bash
cd k:\Prayash\api
npm run build:lambda  # Or your build command
# Deploy to AWS Lambda or your server
```

### 2. Run Database Migration

Drop the unique compound index to allow multiple commission records per period:

```bash
cd k:\Prayash\api
node drop-commission-unique-index.js
```

Expected output:
```
✅ Connected to MongoDB
📋 Current indexes on commissions collection:
1. _id_: {"_id":1}
2. organization_1_period.startDate_-1: {"organization":1,"period.startDate":-1}
3. organization_1_period.startDate_1_period.endDate_1_period.type_1: {"organization":1,"period.startDate":1,...} (unique)

🗑️ Dropping unique index: organization_1_period.startDate_1_period.endDate_1_period.type_1
✅ Unique index dropped successfully
```

### 3. Verify Behavior

1. Have a student make a purchase
2. Verify new commission record is created in admin panel
3. Mark commission as paid
4. Have the SAME student make another purchase
5. Verify:
   - ✅ New separate commission record created
   - ✅ Previous paid commission remains paid
   - ✅ Both records visible in admin panel
   - ✅ New commission can be paid out independently

## Testing Scenarios

### Scenario 1: Single Purchase
- Student makes purchase → New commission created (pending)
- Admin pays commission → Status changes to paid
- ✅ Expected: Commission record shows as paid

### Scenario 2: Multiple Purchases (Same Student)
- Student makes purchase #1 → Commission A created (pending)
- Admin pays commission A → Status changes to paid
- Student makes purchase #2 → **Commission B created (new record)**
- ✅ Expected: Commission A remains paid, Commission B is pending

### Scenario 3: Same Day Multiple Purchases
- Student makes 3 purchases on same day
- ✅ Expected: 3 separate commission records created
- Admin can pay each individually

## Impact on Existing Data

- **Existing commission records**: Remain unchanged
- **Records with multiple purchases**: Will still work, but new purchases won't be added to them
- **Old paid commissions**: Remain paid and visible
- **No data loss**: All historical data is preserved

## Optional: Split Existing Records

If you want to clean up old aggregated records (optional, not required):

```javascript
// Example script to split old records (run carefully in production)
const aggregatedCommissions = await Commission.find({
  purchaseCount: { $gt: 1 },
  status: { $ne: 'paid' }
});

for (const comm of aggregatedCommissions) {
  // Create separate commission for each purchase
  for (const purchase of comm.purchases) {
    await Commission.create({
      organization: comm.organization,
      period: comm.period,
      purchases: [purchase],
      payouts: [comm.payouts.find(p => p.purchaseId.equals(purchase.purchase))],
      totalSales: purchase.amount,
      purchaseCount: 1,
      commissionRate: comm.commissionRate,
      baseCommission: purchase.commission,
      totalCommission: purchase.commission,
      finalAmount: purchase.commission,
      status: 'pending',
      // ...
    });
  }
  
  // Archive or delete old record
  await Commission.findByIdAndDelete(comm._id);
}
```

## Monitoring

After deployment, monitor logs for:
- ✅ `Creating new commission record for` - Confirms per-purchase logic
- ✅ `Commission ID:` and `Purchase:` should match one-to-one
- ❌ `Duplicate commission period detected` - Should NOT appear

## Rollback Plan

If issues occur:

1. Revert code changes to previous version
2. Re-create unique index:
   ```javascript
   db.commissions.createIndex(
     { organization: 1, "period.startDate": 1, "period.endDate": 1, "period.type": 1 },
     { unique: true }
   );
   ```

## Files Changed

1. `src/models/Commission.ts` - Removed unique index
2. `src/controllers/webhookController.ts` - Rewrote commission creation logic
3. `drop-commission-unique-index.js` - Migration script (new file)
4. `COMMISSION_FIX_SUMMARY.md` - This documentation (new file)

## Questions?

- **Q: Will old commissions disappear?**  
  A: No, all existing records remain visible.

- **Q: Can I still pay old aggregated commissions?**  
  A: Yes, they work exactly as before.

- **Q: What happens to commission reports?**  
  A: Reports will now show more records (one per purchase) but more accurate tracking.

- **Q: Performance impact?**  
  A: Minimal. Slightly more database records, but better data integrity.

## Success Criteria

✅ New purchases create separate commission records  
✅ Paid commissions remain paid  
✅ Each commission can be paid independently  
✅ No status conflicts or merging issues  
✅ Clear audit trail for each transaction
