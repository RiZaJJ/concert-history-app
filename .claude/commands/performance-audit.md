# Performance Audit

Conduct a comprehensive performance analysis of the Concert History App:

## 1. Database Query Analysis
- Identify queries taking >100ms (check console logs)
- Find N+1 query patterns in routers.ts
- Check for missing indexes (compare schema.ts to common queries)
- Analyze JOIN complexity and query plan efficiency

## 2. API Endpoint Performance
- Review all tRPC endpoints in routers.ts
- Check for sequential vs parallel operations
- Identify opportunities for caching
- Measure response times (target: <200ms p95)

## 3. Frontend Performance
- Analyze bundle size (check build output)
- Identify large dependencies
- Look for unnecessary re-renders
- Check for missing React.memo or useMemo

## 4. External API Usage
- Review setlist.fm API call patterns
- Check rate limiting implementation
- Verify caching strategy
- Measure external API latency

## 5. Recommendations
Provide prioritized list of improvements:
- **High Impact / Low Effort**: Do these first
- **High Impact / High Effort**: Plan for future sprints
- **Low Impact / Low Effort**: Nice-to-haves
- **Low Impact / High Effort**: Avoid/defer

Format: Markdown report with specific file references, line numbers, and code examples.

Target Metrics:
- Dashboard load: <500ms
- Photo import: 10 photos/second
- Database queries: <50ms p95
- API responses: <200ms p95
