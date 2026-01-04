# Database Migration Helper

Create a new database migration following project conventions:

1. **Gather Information**:
   - Ask for migration description
   - Determine if this is a schema change, data migration, or index update
   - Check existing migrations to determine next number

2. **Generate Migration File**:
   - Create file: `/migrations/XXX-description.sql` (e.g., `002-venue-aliases.sql`)
   - Include header comment with purpose and date
   - Write forward migration SQL
   - Write rollback SQL commands (commented)

3. **Update Schema** (if needed):
   - Update `/drizzle/schema.ts` with new columns/tables/indexes
   - Ensure TypeScript types match SQL schema

4. **Generate Test Queries**:
   - Create verification queries to test migration success
   - Include sample data queries to validate

5. **Update Documentation**:
   - Add migration notes to relevant docs
   - Update CLAUDE.md if schema changes affect core functionality

Format:
```sql
-- Migration XXX: Description
-- Date: YYYY-MM-DD
-- Purpose: Brief explanation

-- Forward migration
[SQL commands here]

-- ROLLBACK (if needed):
-- [Rollback SQL commands here]
```
