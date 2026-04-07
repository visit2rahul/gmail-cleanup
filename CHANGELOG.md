# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-07

### Added
- Jest test suite with 40 test cases covering all functions, safety guarantees, and edge cases
- Mock infrastructure for Google Apps Script globals (GmailApp, PropertiesService, ScriptApp, Logger)
- GitHub Actions CI pipeline — tests run on every push and PR
- CONTRIBUTING.md with development setup and guidelines
- CODE_OF_CONDUCT.md (Contributor Covenant)
- Issue templates for bug reports and feature requests
- Pull request template with safety checklist
- CHANGELOG.md

### Fixed
- `bulkCleanup()` time-limit exit now properly stops processing all remaining domains (previously `return` inside `forEach` only skipped to the next domain)

## [1.0.0] - 2026-04-07

### Added
- `discoverSpam()` — read-only scan ranking top senders by volume across Promotions, Updates, Social, and Spam
- `bulkCleanup()` — trashes emails from blocked domains, explicitly excludes Primary inbox
- `purgeOldPromotions()` — trashes promotional emails older than configurable threshold
- `dailyAutoClean()` — runs both cleanup functions together
- `installTrigger()` / `removeTriggers()` — automated daily scheduling at 3am
- `updateBlockedDomains()` / `unblockDomain()` — manage block list via Script Properties
- `configureDefaults()` — one-time initialization of script settings
- `addBlocks()` — template function for users to add their own domains
- Configuration stored in Script Properties (not hardcoded)
- Primary inbox safety guard (`-category:primary`) on all cleanup queries
- Time-based execution limits (5-minute safety cap) to respect Apps Script runtime limits
- MIT License
- Comprehensive README with setup guide, FAQ, and full function reference
