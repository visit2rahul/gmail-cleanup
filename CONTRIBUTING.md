# Contributing to Gmail Inbox Sweeper

Thanks for your interest in contributing. This is a small, focused project and we'd like to keep it that way.

## Getting Started

```bash
git clone https://github.com/visit2rahul/gmail-inbox-sweeper.git
cd gmail-inbox-sweeper
npm install
npm test
```

## Project Structure

```
src/cleanup.gs         — The entire script (single file, runs in Google Apps Script)
tests/cleanup.test.js  — Jest test suite with mocked Google APIs
tests/mocks/           — Mock implementations of GmailApp, PropertiesService, etc.
```

## Guidelines

### Code
- This is a single-file Google Apps Script. Please keep it that way.
- Use ES5 syntax (`var`, `function`, no arrow functions) — Google Apps Script's V8 runtime supports ES6+ but older runtimes do not.
- Do not add external dependencies. The script must run standalone in Google Apps Script with zero imports.
- Every function that trashes emails must include `-category:primary` in the search query. This is a non-negotiable safety guarantee.

### Tests
- All new functions need test coverage.
- Run `npm test` before submitting a PR. CI will also run tests.
- Safety-critical behavior (Primary inbox exclusion, trash-not-delete) must have explicit test cases.

### Pull Requests
- Keep PRs small and focused — one feature or fix per PR.
- Tests must pass.
- Do not commit personal data (email addresses, domain lists, etc.).
- Use the PR template.

### What We Won't Accept
- Dependencies (npm packages used at runtime in the script).
- Features that require OAuth tokens or API keys in the repo.
- Changes that weaken safety guarantees (Primary inbox protection, trash-not-delete).

## Reporting Bugs

Open an issue using the bug report template. Include:
- What you expected to happen
- What actually happened
- Your Apps Script execution log (View > Logs)

## Questions?

Open an issue. We're happy to help.
