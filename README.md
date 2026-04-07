# Gmail Cleanup

Google Apps Script that automatically cleans up your Gmail inbox. Discovers spam senders, bulk-trashes by domain, and purges old promotions — on demand or on a daily schedule.

## Safety

- **Never touches Primary inbox** — all cleanup queries explicitly exclude `category:primary`
- **Trash, not delete** — everything goes to Trash (recoverable for 30 days)
- **Discovery is read-only** — `discoverSpam()` only reads and reports, changes nothing
- **You control the block list** — only domains you explicitly add get cleaned up

## Setup

1. Go to [script.google.com](https://script.google.com) and create a new project
2. Paste the contents of `src/cleanup.gs`
3. Run `configureDefaults()` — initializes settings (one-time)
4. Run `discoverSpam()` — view top senders in **View > Logs**

## Usage

### Discover who's spamming you

Run `discoverSpam()`. Check **View > Logs** for a ranked list of senders by volume across Promotions, Updates, Social, and Spam categories.

### Block domains

In the Apps Script editor, run this in the execution log or create a wrapper function:

```javascript
function addBlocks() {
  updateBlockedDomains(['spammydomain.com', 'newsletters.junk.co']);
}
```

To view current block list: run `updateBlockedDomains()` with no arguments.

To unblock: `unblockDomain('spammydomain.com')`.

### Run cleanup

- **`bulkCleanup()`** — trashes emails from all blocked domains (skips Primary)
- **`purgeOldPromotions()`** — trashes promotions older than 7 days (configurable)
- **`dailyAutoClean()`** — runs both

### Schedule daily cleanup

Run `installTrigger()` once. This sets up a daily trigger at 3am.

To remove: `removeTriggers()`.

## Configuration

All config is stored in Script Properties (File > Project properties > Script properties), not hardcoded. Defaults:

| Property | Default | Description |
|---|---|---|
| `BLOCK_DOMAINS` | `[]` | JSON array of domains to trash |
| `PROMO_MAX_AGE_DAYS` | `7` | Days before promotions are auto-trashed |
| `SCAN_WINDOW_DAYS` | `30` | Lookback window for `discoverSpam()` |

## License

MIT
