# Testing Plan: Week 1-4

## What I Can Do Without You

### ✅ Implementation (I'll do this now)
- [x] Write SQL migration for database indexes
- [x] Fix N+1 queries in code
- [x] Fix timezone bug
- [x] Fix venue encoding bug
- [x] Fix race condition bug
- [x] Build export/import functionality
- [x] Optimize query patterns
- [x] Add confidence scoring logic
- [x] Create venue alias system

### ✅ Basic Testing (I can verify)
- [x] Code compiles without errors
- [x] TypeScript types are correct
- [x] SQL syntax is valid
- [x] No obvious logic errors

---

## What YOU Need to Test (Real Data)

### 🧪 Week 1: Performance Testing (30 minutes)

**After I implement indexes & query fixes:**

#### Test 1: Dashboard Load Speed
```bash
# Before changes
1. Open dashboard
2. Note: How long to load concerts? _____ seconds

# After my changes
1. Restart server (tsx watch will pick up changes)
2. Open dashboard
3. Note: How long now? _____ seconds

✅ Success if: 10x faster (e.g., 3 sec → 0.3 sec)
```

#### Test 2: Photo Review Page
```bash
1. Go to Photo Review page
2. Note: How long to load unmatched photos? _____ seconds

✅ Success if: Loads in < 1 second
```

#### Test 3: Database Query Times
```bash
# I'll add console logs showing query times
1. Check browser console
2. Look for: "[Query] concerts.list took XXms"

✅ Success if: Most queries < 50ms
```

**Time needed: 5-10 minutes**

---

### 🎯 Week 2: Accuracy Testing (1-2 hours)

**This is THE MOST IMPORTANT test - needs your real data!**

#### Before Testing (I'll build this feature)
```typescript
// New endpoint: Generate accuracy report
GET /api/photos/accuracy-report

Response:
{
  totalPhotos: 1234,
  autoMatched: 850,
  manuallyMatched: 200,
  unmatched: 184,
  autoMatchRate: 68.9%,

  // NEW: After improvements
  confidenceScores: {
    high: 750,    // >80% confidence
    medium: 100,  // 50-80% confidence
    low: 0        // <50% confidence
  },

  failureReasons: [
    { reason: "GPS wrong", count: 50 },
    { reason: "Venue not in setlist.fm", count: 30 },
    { reason: "Bad EXIF data", count: 20 }
  ]
}
```

#### Test: Re-scan Your Photos
```bash
1. Click "Re-scan All Unmatched Photos" button (I'll add this)
2. Wait for completion
3. Check accuracy report

✅ Success if: Auto-match rate > 90% (up from ~70%)
```

#### Test: Spot Check Matches
```bash
1. Go to a concert you KNOW you attended
2. Check if photos are correctly linked
3. Try 5-10 different concerts

Examples to check:
- Phish @ Sphere (April 19, 2024)
- Dead & Company @ [venue]
- [Your most attended artist]

✅ Success if:
- No false positives (wrong concert)
- Photos you expect are there
- Confidence scores make sense
```

**Time needed: 1-2 hours (but gives most value!)**

---

### 📦 Week 3: Export/Import Testing (15 minutes)

#### Test 1: Export Database
```bash
# I'll add npm scripts
npm run export -- --format json --output ~/Desktop/backup.json

1. Run command
2. Check ~/Desktop/backup.json exists
3. Open in text editor - should be readable JSON

✅ Success if: File exists, valid JSON, contains your concerts
```

#### Test 2: Import Backup
```bash
# Test import (dry-run mode, doesn't modify DB)
npm run import -- --file ~/Desktop/backup.json --dry-run

✅ Success if:
- Reports "Would import X concerts, Y photos"
- No errors
```

#### Test 3: Full Restore Cycle
```bash
# DANGEROUS - Only run if you're comfortable
# (I'll add safety checks)

1. Export database
2. Reset database (delete all data)
3. Import backup
4. Verify all concerts/photos restored

✅ Success if: Zero data loss
```

**Time needed: 15 minutes**

---

### 🎨 Week 4: UX Testing (30 minutes)

#### Test: Bulk Photo Actions
```bash
1. Go to Photo Review page
2. Select 10 photos (checkboxes)
3. Click "Link All to Concert" → Pick concert
4. Verify all 10 photos linked

✅ Success if: Can link 50 photos in < 2 minutes
```

#### Test: Venue Aliases
```bash
# After matching a photo with wrong venue name
1. Photo detected venue: "Sphere"
2. Actual venue: "Sphere at The Venetian Resort"
3. Click "Remember this mapping"
4. Future photos with "Sphere" → auto-match to correct venue

✅ Success if: Alias saved, future photos use it
```

**Time needed: 30 minutes**

---

## Testing Schedule

### Week 1 (I implement, you test once)
- **Monday-Thursday**: I implement indexes + bug fixes
- **Friday**: You test (10 minutes)
  - Dashboard speed
  - Query times
  - No errors in console

### Week 2 (I implement, you test thoroughly)
- **Monday-Thursday**: I implement accuracy improvements
- **Friday**: You test (1-2 hours) ⭐ MOST IMPORTANT
  - Re-scan photos
  - Check accuracy report
  - Spot check 10 concerts
  - Report issues

### Week 3 (I implement, you test once)
- **Monday-Thursday**: I implement export/import
- **Friday**: You test (15 minutes)
  - Export database
  - Dry-run import
  - Verify backup works

### Week 4 (I implement, you test)
- **Monday-Thursday**: I implement bulk actions + UX
- **Friday**: You test (30 minutes)
  - Bulk linking
  - Venue aliases
  - Overall UX

---

## What I Need From You

### Immediate (Before I Start)
1. ✅ Approval to proceed (you gave it)
2. ✅ Budget confirmed (<$25/month) (confirmed)
3. ⏳ **Your 18k photos location**
   - Are they in Google Drive already?
   - Do I have the right folder ID?

### Weekly (Friday Testing)
1. **10-30 minutes of testing** (depends on week)
2. **Feedback**: What worked? What broke? What's still inaccurate?
3. **Screenshots** if something looks wrong

### Critical Feedback Needed (Week 2)
- **Accuracy**: Which photos still not matching?
- **False positives**: Any photos linked to WRONG concert?
- **Edge cases**: Festivals, multi-day events, etc.

---

## How to Report Issues

### Option 1: Screenshots Folder
```bash
# Just drop screenshots in this folder
/Users/rmitra/CHA WORKING-V1/screenshots/

# Name them descriptively:
week2-accuracy-phish-not-matching.png
week3-export-error.png
```

### Option 2: Text File
```bash
# Create a file
/Users/rmitra/CHA WORKING-V1/TESTING_FEEDBACK.md

# Format:
## Week 1 Testing (Jan 10, 2026)

### Performance
- Dashboard: 3s → 0.4s ✅ Great!
- Photo review: 2s → 0.5s ✅ Much better

### Bugs Found
- Concert detail page slow (still 2s)
- [Screenshot: week1-concert-detail-slow.png]

### Other Notes
- Looks good overall
- Ready for Week 2
```

### Option 3: Just Tell Me
When you're back after testing, just say:
- "Week 1 done, everything faster, no issues"
- "Week 2 done, accuracy now 85%, but Phish concerts still not matching"
- Etc.

---

## What Happens If You Find Bugs

### Minor Issues
- I fix them immediately
- You don't need to re-test
- Included in next week's testing

### Major Issues
- I fix and ask you to re-test that specific thing
- Example: "Accuracy still only 75% after my changes"
  - I investigate, fix, ask you to re-run accuracy report

### Blockers
- Example: "Export feature crashes immediately"
  - I fix same day, you re-test when ready

---

## My Autonomous Work (What I'll Do Without Asking)

### This Week (Week 1)
**Monday**:
- Create database indexes
- Test locally (no errors)

**Tuesday**:
- Fix N+1 queries
- Add query timing logs
- Test: Dashboard loads faster

**Wednesday**:
- Fix timezone bug
- Fix venue encoding bug
- Test: No crashes

**Thursday**:
- Fix race condition
- Add performance monitoring
- Test: Everything compiles

**Friday**:
- Notify you: "Week 1 ready for testing"
- Give you 3 commands to run
- Wait for your 10-minute feedback

---

## Efficiency: Parallel Testing

**You can test while I build next week:**

```
Week 1 (Mon-Thu): I build indexes + bug fixes
Week 1 (Fri): You test (10 min)

Week 2 (Mon): You give feedback on Week 1
Week 2 (Mon-Thu): I build accuracy improvements
Week 2 (Fri): You test accuracy (1-2 hours)

Week 3 (Mon): You give feedback on Week 2
Week 3 (Mon-Thu): I build export/import
... etc
```

**Total your time: ~3-4 hours over 4 weeks**

---

## Summary

### What I Do (95% of the work)
- Write all code
- Fix all bugs
- Build all features
- Test compilation
- Optimize performance

### What You Do (5% of the work, 100% of validation)
- **Week 1**: 10 min - Test speed
- **Week 2**: 1-2 hours - **Test accuracy** ⭐ CRITICAL
- **Week 3**: 15 min - Test export/import
- **Week 4**: 30 min - Test UX improvements

**Total: ~3 hours over 4 weeks**

### Why Your Testing Matters
- **Real data**: I can't test with your 18k photos
- **Real accuracy**: Only you know which concerts you attended
- **Real use cases**: You'll find edge cases I miss

---

## Ready to Start?

**My Plan**: Start implementing Week 1 now (database indexes + bug fixes)

**Your Plan**: Wait for me to say "Week 1 ready for testing" (Friday)

**Questions for you**:
1. ⏳ Are your 18k photos already in Google Drive? (I'll work with whatever you have)
2. ⏳ Do you want daily updates or just "ready for testing" notifications?
3. ⏳ Best day for testing? (I said Friday but flexible)

**Default assumption** (if you don't answer):
- Photos in Google Drive ✓
- Weekly "ready for testing" notifications ✓
- Friday testing ✓

🚀 **Starting Week 1 implementation now!**
