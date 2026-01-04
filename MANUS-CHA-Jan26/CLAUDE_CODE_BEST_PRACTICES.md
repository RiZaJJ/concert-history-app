# Claude Code Best Practices for Concert History App

## Summary of Key Recommendations

Based on [Siddharth Bharath's guide](https://www.siddharthbharath.com/claude-code-the-complete-guide/), here's how we can improve our workflow:

---

## 1. Project Documentation (CLAUDE.md) - HIGH PRIORITY

### What It Is
A markdown file that Claude reads automatically to understand your project's architecture, conventions, and preferences.

### Implementation for Our Project

Create `/Users/rmitra/CHA WORKING-V1/CLAUDE.md`:

```markdown
# Concert History App - Project Context

## Overview
Single-user, local-first concert photo management app. Focus on accuracy over scale.

## Architecture
- **Frontend**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Backend**: Node.js, Express, tRPC 11
- **Database**: MySQL (local), will migrate to TiDB Serverless for cloud
- **Photos**: Google Drive integration, S3 for starred photos

## Key Design Decisions
- **Local-first**: Runs on user's computer, <$25/month budget
- **Accuracy > Scale**: Optimize for 95%+ photo matching, not concurrent users
- **Database portability**: Export/import functionality for future cloud migration
- **Offline-capable**: Eventually sync to mobile via local WiFi

## Database Schema
- `concerts`: User concerts with artist, venue, date (unique: userId + venueId + concertDate)
- `photos`: Linked photos with EXIF data, starring
- `unmatched_photos`: Photos needing manual review
- `venues`: OSM venues with GPS coordinates (cached)
- `artists`: MusicBrainz artists from setlist.fm

## Concert Matching Algorithm
1. **Database-first**: Check user's existing concerts before external APIs
2. **setlist.fm**: Search by venue + date + GPS (fuzzy venue matching, 70% threshold)
3. **Headliner detection**: Photos <8:30pm → opener, >8:30pm → headliner (song count heuristic)
4. **Manual tools**: Artist search, manual venue input, bulk actions

## Code Conventions
- **File structure**: `server/` (backend), `client/src/` (frontend), `drizzle/` (schema)
- **Queries**: Use Drizzle ORM, prefer JOINs over N+1 queries
- **Dates**: Always normalize to noon UTC (`dateToNoonUTC()`)
- **Logging**: Use `logDbRead()`, `logDbWrite()` for all database operations
- **Error handling**: Throw TRPCError with clear messages

## Testing Philosophy
- Test with real user data (18k photos)
- Focus on accuracy metrics (% auto-matched)
- Performance benchmarks: <50ms queries, <500ms API responses
- User testing every Friday (15-30 minutes)

## Current Phase
**Week 1**: Database optimization + bug fixes (COMPLETE)
**Week 2**: Accuracy improvements (confidence scoring, venue aliases)
**Week 3**: Export/import + backup automation
**Week 4**: Manual review UX improvements

## Budget Constraints
- Infrastructure: $0 (local deployment)
- AI costs: <$10/month (cached responses, batch processing)
- Total: <$25/month

## AI Usage Guidelines
- Cache all AI responses locally (SQLite)
- Batch insights weekly, not real-time
- User can disable AI features to save costs

## Future Migration Path
When ready to scale:
1. Export database (JSON/SQL)
2. Provision TiDB + Redis + CloudFlare
3. Import database
4. Update environment variables
Timeline: 1 day (all planning in PHASE_2_SCALABILITY.md)
```

**Action**: Create this file so Claude always has project context

---

## 2. Use Plan Mode Strategically - ALREADY DOING ✅

### What We're Doing Right
- ✅ Used Plan Mode for all major architecture decisions
- ✅ Created comprehensive planning docs (PHASE_1, PHASE_2, PHASE_3)
- ✅ Identified decision points and trade-offs

### What We Can Improve
- Use `/plan` command explicitly when starting new features
- Example: "Let's plan Week 2 accuracy improvements" → enters Plan Mode → explores codebase → creates detailed plan

**Recommendation**: Keep doing what we're doing!

---

## 3. Context Management with /compact - IMPORTANT

### Problem
Long conversations approach token limits and get auto-summarized, potentially losing important details.

### Solution
Use `/compact` with specific instructions:

```
/compact
Preserve:
- All database schema knowledge
- Concert matching algorithm details
- Performance optimization decisions
- Budget constraints (<$25/month)
- Local-first architecture decisions
- Week 1-4 implementation plan
- File locations and code patterns
```

**Action**: When approaching 150k tokens, use `/compact` instead of letting auto-summarization happen

---

## 4. Custom Slash Commands - HIGH VALUE

### What It Is
Create reusable workflows as markdown files in `.claude/commands/`

### Useful Commands for Our Project

#### `.claude/commands/week-status.md`
```markdown
# Week Status Report

Generate a status report for the current week:

1. List all completed tasks from todo list
2. Show performance improvements (before/after metrics)
3. Identify any bugs or blockers
4. Estimate testing time needed
5. Preview next week's tasks
6. Update TESTING_FEEDBACK.md with template

Format as a concise summary suitable for Friday testing.
```

#### `.claude/commands/accuracy-report.md`
```markdown
# Photo Matching Accuracy Report

Analyze photo matching accuracy:

1. Query database for total photos, matched, unmatched counts
2. Calculate auto-match rate (%)
3. Group unmatched photos by failure reason:
   - No GPS data
   - GPS wrong (>5km from any venue)
   - Venue not in setlist.fm
   - Date mismatch
   - Other
4. Show top 5 venues with most unmatched photos
5. Suggest accuracy improvements

Output in markdown table format.
```

#### `.claude/commands/db-migration.md`
```markdown
# Database Migration Helper

Create a new database migration:

1. Ask for migration description
2. Generate migration SQL file in /migrations/ with incremental number
3. Update schema.ts if needed
4. Add rollback SQL commands
5. Update migration documentation
6. Generate test queries to verify migration

Follow naming: XXX-description.sql (e.g., 002-venue-aliases.sql)
```

#### `.claude/commands/performance-audit.md`
```markdown
# Performance Audit

Analyze application performance:

1. Identify slow database queries (>100ms)
2. Find N+1 query patterns
3. Check for missing indexes
4. Review API endpoint response times
5. Analyze bundle size (frontend)
6. Generate performance improvement recommendations

Prioritize by impact vs effort.
```

**Action**: Create these commands for frequently needed workflows

---

## 5. Git Workflow Improvements - MEDIUM PRIORITY

### Current State
We're working directly on main branch (no version control setup yet)

### Recommended Workflow

#### Option 1: Feature Branches (Simple)
```bash
# Week 2 work
git checkout -b week-2-accuracy-improvements
# ... implement features ...
git commit -m "Add confidence scoring"
git commit -m "Add venue alias system"
# Test thoroughly
git checkout main
git merge week-2-accuracy-improvements
```

#### Option 2: Git Worktrees (Advanced - for parallel work)
```bash
# Main work in primary location
cd /Users/rmitra/CHA\ WORKING-V1

# Create worktree for experimental feature
git worktree add ../CHA-export-feature export-feature

# Now you can work on export feature in parallel
# Each worktree has independent Claude Code chat!
```

**Benefits**:
- Safe experimentation
- Easy rollback with `/rewind`
- Parallel development without context switching

**Action**: Initialize git repo if not already done

---

## 6. Sub-Agents for Specialized Tasks - FUTURE

### What It Is
Deploy specialized Claude agents for specific tasks (code review, testing, docs)

### Use Cases for Our Project

```bash
# After major changes
claude agent review --context "Review Week 2 changes for bugs and performance issues"

# Before committing
claude agent test --context "Generate unit tests for confidence scoring algorithm"

# For documentation
claude agent docs --context "Update README with new accuracy features"
```

**Action**: Explore after Week 4 when we have more code to review

---

## 7. Hooks for Automation - HIGH VALUE

### What It Is
Automatic actions at specific lifecycle points

### Useful Hooks for Our Project

#### Auto-update CLAUDE.md after schema changes
```bash
claude hooks set post-tool-use "
  if file changed is drizzle/schema.ts:
    update CLAUDE.md database schema section
"
```

#### Auto-run tests after code changes
```bash
claude hooks set post-tool-use "
  if files changed in server/:
    run npm run test
    report any failures
"
```

#### Auto-update documentation
```bash
claude hooks set stop "
  if any .ts files changed:
    check if README needs updates
    suggest documentation improvements
"
```

**Action**: Set up basic hooks after Week 2

---

## 8. Testing Strategy Improvements - CRITICAL

### Current Approach
- Manual testing every Friday (15-30 minutes)
- Real data (your 18k photos)

### Enhanced Approach (from guide)

#### Week 2 Testing Plan
```
Ask Claude to create comprehensive test suite:
1. Unit tests for concert matching algorithm
2. Integration tests for database-first matching
3. E2E tests for photo import workflow
4. Performance tests (query benchmarks)
5. Accuracy tests (% auto-match validation)

Let Claude analyze existing code to understand:
- Edge cases (midnight concerts, festivals)
- Validation logic (GPS accuracy, date normalization)
- Business rules (headliner detection heuristics)
```

**Example Prompt**:
```
Create a comprehensive test suite for the concert matching algorithm.

Test cases should cover:
- Database-first matching (existing concerts)
- setlist.fm fallback (new concerts)
- Fuzzy venue matching (70% threshold)
- Headliner detection (song count + timestamp)
- Edge cases: midnight concerts, no GPS, bad GPS, festivals
- Performance: <100ms per photo matching

Use vitest. Generate tests in server/__tests__/concertMatching.test.ts
```

**Action**: Implement before Week 2 accuracy improvements

---

## 9. MCP Servers for External Integrations - FUTURE

### What It Is
Connect external tools (databases, APIs, web search) to Claude Code

### Potential Use Cases

```bash
# Direct database queries during development
claude mcp add mysql -s project

# Web search for venue information
claude mcp add brave-search -s project

# GitHub integration for issues/PRs (when ready for cloud)
claude mcp add github -s project
```

**Action**: Explore after local-first phase (Week 4+)

---

## 10. Performance Optimization Workflow - IMPLEMENT NOW

### Data-Driven Approach (from guide)

Instead of guessing what's slow, let Claude audit:

**Prompt Template**:
```
Performance audit for Concert History App:

Target metrics:
- Dashboard load time: <500ms (current: ~3 seconds)
- Photo import: 10 photos/second (current: 1 photo/second)
- Database queries: <50ms p95 (current: ~500ms)
- API responses: <200ms p95

Steps:
1. Identify top 5 performance bottlenecks
2. Analyze root causes
3. Recommend fixes prioritized by impact/effort
4. Implement highest-impact optimizations first
5. Provide before/after benchmarks

Focus on database queries, API calls, and frontend rendering.
```

**Action**: Use this for Week 1 testing

---

## Implementation Priority

### Immediate (This Week)
1. ✅ **Create CLAUDE.md** - Gives Claude permanent project context
2. ✅ **Performance audit prompt** - Validate Week 1 improvements
3. ⏳ **Custom commands** - Create `/week-status` and `/accuracy-report`

### Week 2
1. **Testing suite** - Comprehensive tests for accuracy improvements
2. **Git workflow** - Initialize repo, feature branches
3. **Context management** - Use `/compact` if needed

### Week 3
1. **Hooks** - Auto-update docs, auto-test
2. **Sub-agents** - Code review agent

### Future (Week 4+)
1. **Git worktrees** - Parallel development
2. **MCP servers** - External integrations

---

## Immediate Actions

### 1. Create CLAUDE.md (5 minutes)
```bash
# I'll create this file with project context
# Location: /Users/rmitra/CHA WORKING-V1/CLAUDE.md
```

### 2. Create Custom Commands (10 minutes)
```bash
mkdir -p .claude/commands
# Create week-status.md, accuracy-report.md, db-migration.md
```

### 3. Initialize Git (if not done)
```bash
cd "/Users/rmitra/CHA WORKING-V1"
git init
git add .
git commit -m "Initial commit with Week 1 optimizations"
```

---

## Key Takeaways

### What We're Already Doing Right ✅
- Using Plan Mode for complex features
- Scoping conversations to single features
- Creating comprehensive documentation
- Testing with real data
- Data-driven performance optimization

### Quick Wins We Should Implement 🎯
1. **CLAUDE.md** - Permanent project context
2. **Custom commands** - Reusable workflows
3. **Performance audit prompts** - Systematic optimization
4. **Testing strategy** - Let Claude build comprehensive tests

### Future Enhancements 🔮
- Git worktrees for parallel development
- Sub-agents for specialized tasks
- Hooks for automation
- MCP servers for external tools

---

## Cost Impact

All recommendations: **$0 additional cost**
- CLAUDE.md: Free (better context = better code)
- Custom commands: Free (saves time)
- Git workflow: Free (better safety)
- Testing: Free (prevents bugs)

The guide's suggestions align perfectly with our local-first, budget-conscious approach! 🎉

---

## Next Steps

**Want me to**:
1. Create CLAUDE.md with full project context?
2. Set up custom slash commands?
3. Generate comprehensive test suite for Week 2?
4. Initialize git workflow?

All of these will improve our efficiency without adding costs!
