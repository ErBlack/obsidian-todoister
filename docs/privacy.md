# Privacy & Data

**This plugin connects to Todoist, a third-party service, and transmits your task data over the network.**

## What data is sent

- Task content (the text of your tasks)
- Task completion status (checked/unchecked)
- OAuth access tokens (for authentication with every API request)

## When network requests occur

- When you connect your Todoist account (OAuth authentication)
- When syncing tasks from files with `todoister: true` in frontmatter
- Automatically when you modify tasks in synced files
- When manually triggering resync via command palette

## Where data is stored

- **OAuth tokens**: Stored in Obsidian's secret storage
- **Task IDs**: Embedded as inline metadata in your markdown files (`%%[tid::abc123]%%`)
- **Query cache**: Stored in plugin data to minimize API calls

## User control

- Sync is **opt-in per file** via frontmatter (`todoister: true`)
- You can disconnect your account at any time via **Settings → Todoister → Disconnect**
- Task IDs remain in files after disconnecting but become inactive
- No telemetry or analytics are collected

## Third-party service

- Service: [Todoist](https://todoist.com)
- OAuth endpoint: `https://todoist.com/oauth/authorize`
- API endpoint: `https://api.todoist.com`
- See [Todoist Privacy Policy](https://todoist.com/privacy)
