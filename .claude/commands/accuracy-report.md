# Photo Matching Accuracy Report

Analyze photo matching accuracy and generate a detailed report:

1. **Query Database Metrics**:
   - Total photos in `photos` table
   - Total unmatched photos in `unmatched_photos` table
   - Total concerts in `concerts` table
   - Calculate auto-match rate (%)

2. **Failure Analysis**:
   Group unmatched photos by failure reason:
   - No GPS data (latitude/longitude is NULL)
   - GPS inaccurate (>5km from any known venue)
   - Venue not found in setlist.fm
   - Date mismatch (photo date doesn't match any concert)
   - Festival/multi-artist event (ambiguous)
   - Other/unknown

3. **Top Problem Venues**:
   - Show top 5 venues with most unmatched photos
   - Include venue name, city, and unmatched count

4. **Recommendations**:
   - Suggest specific accuracy improvements based on data
   - Identify patterns in failures
   - Recommend manual review priorities

Output format: Markdown tables with clear metrics and actionable insights.
