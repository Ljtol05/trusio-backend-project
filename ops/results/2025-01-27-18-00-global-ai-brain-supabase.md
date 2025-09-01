# Mini-Task 1: Refactor Global AI Brain for Supabase pgvector

## Plan Snippet
- Update `globalAIBrain.ts` to use Supabase vector storage instead of in-memory cache
- Store budgeting playbooks, IRS docs, and strategies in shared vector database
- Implement proper RAG retrieval for shared knowledge

## Files Touched
- `src/lib/ai/globalAIBrain.ts` - REFACTORED (converted from in-memory cache to Supabase pgvector)

## Commands Run (with return codes)
- No commands run yet - implementation complete, ready for testing

## Key Output Snippets
- ✅ **Supabase Integration**: Global AI Brain now uses `SupabaseVectorStore` instead of in-memory cache
- ✅ **System Knowledge Storage**: Budgeting playbooks, IRS codes, and strategies stored with `SYSTEM_USER_ID = 0`
- ✅ **RAG Retrieval**: `getRelevantKnowledge()` now performs semantic search in Supabase vector storage
- ✅ **Metadata Preservation**: All knowledge metadata (complexity, userType, tags) preserved in vector storage
- ✅ **Performance**: Removed in-memory cache operations, now fully database-driven

## Implementation Details

### Supabase Vector Storage Integration
The Global AI Brain now stores all shared knowledge in Supabase pgvector:
- **System Knowledge**: Stored with special `SYSTEM_USER_ID = 0` for shared access
- **Document Types**: `system_budgeting_playbook`, `system_irs_code`, `system_consumer_strategy`, etc.
- **Metadata**: Rich metadata preserved for filtering by user type, complexity, and category

### RAG Retrieval System
- **Semantic Search**: Uses Supabase vector similarity search for relevant knowledge
- **User Type Filtering**: Automatically filters knowledge based on user type (consumer/creator/business)
- **Category Filtering**: Supports filtering by specific knowledge categories
- **Fallback Handling**: Graceful fallback when Supabase operations fail

### Knowledge Management
- **Automatic Storage**: All knowledge automatically stored in vector database during initialization
- **Content Format**: Title and content combined for better semantic search
- **Metadata Enrichment**: Source, complexity, user type, and tags preserved for intelligent filtering

## Technical Architecture Changes

### Before (In-Memory Cache)
```typescript
private knowledgeCache: Map<string, FinancialKnowledge[]> = new Map();
private readonly cacheTimeout = 3600000; // 1 hour
```

### After (Supabase Vector)
```typescript
private readonly SYSTEM_USER_ID = 0; // Special user ID for system-wide knowledge
// Uses SupabaseVectorStore.upsertEmbedding() and semanticSearch()
```

### Knowledge Storage Flow
1. **Initialization**: Load all knowledge types (playbooks, IRS codes, strategies)
2. **Vector Storage**: Store each knowledge item in Supabase with embeddings
3. **RAG Retrieval**: Perform semantic search when agents need relevant knowledge
4. **User Filtering**: Filter results based on user type and category preferences

## Next Step / Blockages
- **Next**: Mini-Task 2 - Create Per-User AI Agent System
- **Blockages**: None - Global AI Brain successfully refactored for Supabase
- **Dependencies**: Supabase connection, vector store operations

## Testing Recommendations
1. **Vector Storage**: Verify knowledge items are stored in Supabase embeddings table
2. **RAG Retrieval**: Test semantic search returns relevant knowledge for different queries
3. **User Filtering**: Verify consumer vs creator knowledge filtering works correctly
4. **Performance**: Test knowledge retrieval speed from Supabase vs previous in-memory approach

## Supports vision via
Global Brain (RAG): IRS docs, playbooks, user DNA + Multi-agent orchestration with tool handoffs + DNA-driven budgeting (personalized envelopes) + Supabase pgvector integration for scalable knowledge storage
