# Technical overview

## Architecture

This plugin prefer to syncs tasks directly from the editor content rather than reading files from disk. This approach ensures real-time sync without conflicts during active editing.

## Key packages

**[@doist/todoist-api-typescript](https://github.com/doist/todoist-api-typescript)** — Official Todoist SDK.

**[@tanstack/query-core](https://tanstack.com/query)** — State management and caching layer. Handles data synchronization, automatic refetching, and optimistic updates.

## How it works

The plugin hooks into Obsidian's `layout-change` event to process editor content. When changes are detected:

1. Parser extracts tasks from markdown
2. TanStack Query manages state and API calls
3. Mutations update Todoist via the SDK
4. Query invalidation triggers background sync
5. Editor content updates reflect changes from Todoist

Task IDs are embedded as inline metadata (`%%[tid::abc123]%%`) to maintain sync relationships.

## OAuth implementation

The plugin uses OAuth 2.0 for authentication. The client secret is hardcoded in the source code — a technical limitation since Todoist's API doesn't support PKCE (Proof Key for Code Exchange) for public clients.
