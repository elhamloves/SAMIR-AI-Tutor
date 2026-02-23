# Safe Migration Instructions

## ⚠️ Supabase Warning Explanation

The warning you're seeing is because Supabase detects `DROP POLICY` statements in the migration script. This is a safety feature to prevent accidental data loss.

## ✅ Solution: Use the Safe Migration Script

I've created **`safe_migration_schema.sql`** which:
- ✅ **NO DROP statements** - Only adds new things
- ✅ Checks if policies exist before creating them
- ✅ Safe to run multiple times
- ✅ Won't break existing data

## 📋 How to Run

### Option 1: Use Safe Migration Script (Recommended)

1. Open Supabase SQL Editor
2. Copy contents of **`safe_migration_schema.sql`**
3. Paste and run
4. Should execute without warnings

### Option 2: If You Still Get Warnings

If you still see warnings, you can run in **smaller chunks**:

#### Step 1: Add Columns Only
```sql
-- Just add columns (no policies)
-- Copy first 150 lines of safe_migration_schema.sql
```

#### Step 2: Create Tables Only
```sql
-- Just create tables
-- Copy the CREATE TABLE sections
```

#### Step 3: Add Policies Only (if needed)
```sql
-- Policies for new tables only (they don't exist yet, so no conflict)
```

## 🔍 What's Safe About This Script

1. **No data deletion** - Only adds columns/tables
2. **Idempotent** - Safe to run multiple times
3. **Conditional** - Checks before adding anything
4. **No DROP statements** - Won't remove existing policies

## ✅ What Will Happen

- ✅ New columns added to existing tables
- ✅ New tables created
- ✅ New policies created (only if they don't exist)
- ✅ Existing data preserved
- ✅ Existing policies preserved

## 🚨 If You Still Get Errors

If you get specific errors, share them and I can help fix:

1. **Column already exists** - Script handles this (skips if exists)
2. **Table already exists** - Script handles this (CREATE IF NOT EXISTS)
3. **Policy already exists** - Script checks before creating
4. **Foreign key error** - May need to run in specific order

## 📝 Verification

After running, verify in Supabase dashboard:

1. Check `pdf_chunks` table - Should have new columns
2. Check `pdf_metadata` table - Should have new columns  
3. Check new tables exist: `pdf_figures`, `pdf_tables`, `pdf_references`, `pdf_toc`
4. Check indexes are created
5. Check policies exist

---

**The safe migration script is designed to be completely non-destructive!** ✅

