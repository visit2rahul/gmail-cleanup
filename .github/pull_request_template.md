## What does this change?

Brief description of the change and why it's needed.

## How did you test it?

- [ ] `npm test` passes locally
- [ ] Tested in Google Apps Script editor (if applicable)

## Safety checklist

- [ ] All cleanup queries include `-category:primary`
- [ ] All email operations use `moveToTrash()` (not delete)
- [ ] No hardcoded personal data (email addresses, domain lists)
- [ ] No external dependencies added to the script
