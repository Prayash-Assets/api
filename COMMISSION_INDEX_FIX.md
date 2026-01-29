# Commission Index Fix - Action Required

## Problem
The commissions collection has a **unique index** on `(organization, period.startDate, period.endDate, period.type)` that was preventing new commission records from being created when a paid commission already existed for the same organization and period.

This caused:
- New purchases after marking a commission as "paid" to fail silently
- Commissions not being created for new purchases in the same period

## Solution Implemented

### Code Changes (✅ DONE)
1. **Updated webhook logic** in `webhookController.ts`:
   - Only merges new purchases into **UNPAID** commissions (pending/processed status)
   - **Skips merging with PAID** commissions
   - Creates new commission records when no unpaid commission exists
   - Logs clear messages about what's happening

2. **Removed unique index definition** from `Commission.ts` model:
   - Model no longer defines the unique constraint
   - Allows multiple commissions per organization/period

### Database Index - NEEDS MANUAL ACTION ⚠️
**The unique index still exists in MongoDB and must be dropped manually:**

```
Index Name: organization_1_period.startDate_1_period.endDate_1_period.type_1
Database: prayashassets
Collection: commissions
```

## How to Drop the Index

### Option 1: MongoDB Atlas UI
1. Go to https://cloud.mongodb.com/
2. Select your cluster → Collections
3. Find `prayashassets` → `commissions`
4. Click "Indexes"
5. Find `organization_1_period.startDate_1_period.endDate_1_period.type_1`
6. Click the trash icon to delete it

### Option 2: MongoDB Compass
1. Connect to your MongoDB cluster
2. Navigate to `prayashassets` → `commissions`
3. Go to Indexes tab
4. Find `organization_1_period.startDate_1_period.endDate_1_period.type_1`
5. Click delete

### Option 3: MongoDB Shell/CLI
```javascript
use prayashassets
db.commissions.dropIndex('organization_1_period.startDate_1_period.endDate_1_period.type_1')
```

## Expected Behavior After Fix

### New Test Purchase Flow:
1. Student makes 3rd purchase (₹1,995)
2. Webhook processes payment capture
3. Code checks for UNPAID commissions for Jan period → finds NONE (first is PAID)
4. Code creates NEW commission record with status: "pending"
5. Admin portal now shows TWO separate commission records:
   - Commission 1: PAID (original ₹137.75)
   - Commission 2: PENDING (new ₹99.75)

### Commission Records Per Period:
- **Pending/Processing**: Only ONE per org/period (new purchases merge into it)
- **Paid**: Separate records (don't merge new purchases)
- **Multiple paid commissions**: Each gets its own record for audit/history

## Validation Steps
After dropping the index, test with:

```bash
# Make a test purchase
curl -X POST http://localhost:4000/api/purchases/order \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"packageId":"..."}'
```

Check backend logs for:
```
=== [COMMISSION] Starting commission processing ===
✅ [COMMISSION] Organization: ...
...
✅ [COMMISSION] NEW commission created successfully!
```

And verify admin portal shows 2 commission records (1 paid + 1 pending).

## Status
- ✅ Code updated to skip paid commissions
- ⏳ **AWAITING**: Index drop in MongoDB
- 📋 Once index is dropped, new commissions will generate correctly

Contact MongoDB support or use compass to drop the index.
