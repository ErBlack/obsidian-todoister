# Usage

## Connect to Todoist

1. Open **Settings → Todoister**
2. Select **Connect** to open the Todoist authorization page
3. Authorize the plugin in your browser
4. Return to Obsidian to complete the connection

After connecting, select a project from the **Project** dropdown. This determines where new tasks are created in Todoist.

## Enable sync for a file

### Using frontmatter

Add the following to your note's frontmatter:

```yaml
---
todoister: true
---
```

Tasks in this note will now sync with Todoist.

### Using commands

1. Open the command palette (`Ctrl+P` on Windows/Linux, `Command+P` on macOS)
2. Select **Enable Todoist sync for current file**

To disable sync, select **Disable Todoist sync for current file** from the command palette.

## Check sync status

The sync status appears in the status bar in the bottom-right. The indicator shows:

- Checkmark icon — all tasks are synced
- Down arrow with number — downloading tasks from Todoist
- Up arrow with number — uploading tasks to Todoist

## Manual sync

To manually trigger a sync:

- Select **Resync current file with Todoist** from the command palette, or
- Click the sync status indicator in the status bar

## Import existing tasks

To import a task that already exists in Todoist:

1. In the Todoist app, right-click a task and select **Copy link to task**
2. Paste the link on its own line in your note

The plugin automatically converts the link to a synced task.

## Disconnect

To disconnect your Todoist account:

1. Open **Settings → Todoister**
2. Select **Disconnect**

Your OAuth token will be revoked. Task IDs remain in your notes but become inactive.
