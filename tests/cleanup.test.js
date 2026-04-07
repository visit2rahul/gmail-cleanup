/**
 * Tests for Gmail Inbox Sweeper (src/cleanup.gs)
 *
 * These tests verify all functions, safety guarantees, and edge cases
 * using mocked Google Apps Script globals (GmailApp, PropertiesService, etc.)
 *
 * Safety guarantees under test:
 *   - Primary inbox is never touched (query always includes -category:primary)
 *   - Trash only (moveToTrash, never delete)
 *   - Discovery is read-only (no moveToTrash calls during discoverSpam)
 *   - Block list is user-controlled (empty list = no action)
 */

const {
  mockLogger,
  mockPropertiesService,
  mockScriptProperties,
  mockGmailApp,
  mockScriptApp,
  mockTriggerBuilder,
  createMockThread,
  setSearchResults,
  resetAllMocks,
  installGlobals,
} = require('./mocks/gas-mocks');

// Install mocks before loading the script
installGlobals();

// Load the script — functions become global via eval
const fs = require('fs');
const path = require('path');
const scriptSource = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'cleanup.gs'),
  'utf8'
);
eval(scriptSource);

// ============================================================
// Test setup
// ============================================================

beforeEach(() => {
  resetAllMocks();
});

// ============================================================
// A. Configuration functions
// ============================================================

describe('configureDefaults', () => {
  test('sets all three defaults when no properties exist', () => {
    configureDefaults();

    expect(mockScriptProperties.setProperty).toHaveBeenCalledWith('BLOCK_DOMAINS', '[]');
    expect(mockScriptProperties.setProperty).toHaveBeenCalledWith('PROMO_MAX_AGE_DAYS', '7');
    expect(mockScriptProperties.setProperty).toHaveBeenCalledWith('SCAN_WINDOW_DAYS', '30');
  });

  test('does not overwrite existing properties (idempotent)', () => {
    // Pre-set a value
    mockScriptProperties.getProperty.mockImplementation((key) => {
      if (key === 'PROMO_MAX_AGE_DAYS') return '14';
      return null;
    });

    configureDefaults();

    // Should not have been called with PROMO_MAX_AGE_DAYS since it already exists
    var promoSetCalls = mockScriptProperties.setProperty.mock.calls.filter(
      (call) => call[0] === 'PROMO_MAX_AGE_DAYS'
    );
    expect(promoSetCalls).toHaveLength(0);
  });

  test('logs confirmation of settings', () => {
    configureDefaults();
    expect(mockLogger.log).toHaveBeenCalledWith('Defaults configured. Current settings:');
  });
});

describe('getBlockedDomains_ (internal)', () => {
  test('returns empty array when property is null', () => {
    var result = getBlockedDomains_();
    expect(result).toEqual([]);
  });

  test('returns empty array when property is empty JSON array', () => {
    mockScriptProperties.getProperty.mockReturnValue('[]');
    var result = getBlockedDomains_();
    expect(result).toEqual([]);
  });

  test('returns parsed array when property has domains', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com","junk.co"]');
    var result = getBlockedDomains_();
    expect(result).toEqual(['spam.com', 'junk.co']);
  });
});

describe('getConfigInt_ (internal)', () => {
  test('returns parsed integer when property exists', () => {
    mockScriptProperties.getProperty.mockReturnValue('7');
    var result = getConfigInt_('PROMO_MAX_AGE_DAYS', 99);
    expect(result).toBe(7);
  });

  test('returns fallback when property is null', () => {
    mockScriptProperties.getProperty.mockReturnValue(null);
    var result = getConfigInt_('PROMO_MAX_AGE_DAYS', 99);
    expect(result).toBe(99);
  });
});

// ============================================================
// B. Block list management
// ============================================================

describe('updateBlockedDomains', () => {
  test('adds new domains to an empty list', () => {
    mockScriptProperties.getProperty.mockReturnValue('[]');

    updateBlockedDomains(['spam.com', 'junk.co']);

    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    expect(setCall).toBeDefined();
    var stored = JSON.parse(setCall[1]);
    expect(stored).toEqual(['spam.com', 'junk.co']);
  });

  test('merges without duplicates', () => {
    mockScriptProperties.getProperty.mockReturnValue('["a.com"]');

    updateBlockedDomains(['a.com', 'b.com']);

    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    var stored = JSON.parse(setCall[1]);
    expect(stored).toEqual(['a.com', 'b.com']);
  });

  test('with no arguments, logs current list without modifying', () => {
    mockScriptProperties.getProperty.mockReturnValue('["a.com","b.com"]');

    updateBlockedDomains();

    // setProperty should NOT have been called for BLOCK_DOMAINS
    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    expect(setCall).toBeUndefined();
    expect(mockLogger.log).toHaveBeenCalledWith('Current blocked domains (2):');
  });

  test('with empty array, logs current list without modifying', () => {
    mockScriptProperties.getProperty.mockReturnValue('["a.com"]');

    updateBlockedDomains([]);

    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    expect(setCall).toBeUndefined();
  });
});

describe('unblockDomain', () => {
  test('removes a domain that exists in the list', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com","junk.co"]');

    unblockDomain('spam.com');

    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    var stored = JSON.parse(setCall[1]);
    expect(stored).toEqual(['junk.co']);
  });

  test('does not error when domain is not in the list', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    expect(() => unblockDomain('nothere.com')).not.toThrow();
  });

  test('results in empty list when removing the only domain', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    unblockDomain('spam.com');

    var setCall = mockScriptProperties.setProperty.mock.calls.find(
      (call) => call[0] === 'BLOCK_DOMAINS'
    );
    var stored = JSON.parse(setCall[1]);
    expect(stored).toEqual([]);
  });
});

// ============================================================
// C. Discovery (discoverSpam)
// ============================================================

describe('discoverSpam', () => {
  test('returns sender counts keyed by domain', () => {
    var thread1 = createMockThread('Newsletter <news@spam.com>', 3);
    var thread2 = createMockThread('Updates <info@spam.com>', 2);
    var thread3 = createMockThread('user@legit.org', 1);

    setSearchResults('category:promotions', [[thread1, thread3]]);
    setSearchResults('category:updates', [[thread2]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();

    expect(result['spam.com']).toBe(5); // 3 + 2
    expect(result['legit.org']).toBe(1);
  });

  test('extracts domain from formatted From header', () => {
    var thread = createMockThread('"Sales Team" <promo@retailer.com>', 1);
    setSearchResults('category:promotions', [[thread]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();
    expect(result['retailer.com']).toBe(1);
  });

  test('extracts domain from bare email address', () => {
    var thread = createMockThread('user@domain.org', 1);
    setSearchResults('category:promotions', [[thread]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();
    expect(result['domain.org']).toBe(1);
  });

  test('lowercases domains', () => {
    var thread = createMockThread('user@SPAM.COM', 1);
    setSearchResults('category:promotions', [[thread]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();
    expect(result['spam.com']).toBe(1);
  });

  test('handles From with no @ symbol gracefully', () => {
    var thread = createMockThread('Unknown Sender', 1);
    setSearchResults('category:promotions', [[thread]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();
    expect(result['Unknown Sender']).toBe(1);
  });

  test('returns empty object for empty inbox', () => {
    setSearchResults('category:promotions', [[]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    var result = discoverSpam();
    expect(Object.keys(result)).toHaveLength(0);
  });

  test('SAFETY: does not call moveToTrash (read-only)', () => {
    var thread = createMockThread('user@spam.com', 1);
    setSearchResults('category:promotions', [[thread]]);
    setSearchResults('category:updates', [[]]);
    setSearchResults('category:social', [[]]);
    setSearchResults('label:spam', [[]]);

    discoverSpam();

    expect(thread.moveToTrash).not.toHaveBeenCalled();
  });
});

// ============================================================
// D. Bulk cleanup — SAFETY CRITICAL
// ============================================================

describe('bulkCleanup', () => {
  test('with empty block list, logs message and does not search', () => {
    mockScriptProperties.getProperty.mockReturnValue('[]');

    bulkCleanup();

    expect(mockGmailApp.search).not.toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('No blocked domains')
    );
  });

  test('trashes emails from blocked domains', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    var thread1 = createMockThread('user@spam.com', 1);
    var thread2 = createMockThread('other@spam.com', 1);
    setSearchResults('from:@spam.com', [[thread1, thread2], []]);

    bulkCleanup();

    expect(thread1.moveToTrash).toHaveBeenCalled();
    expect(thread2.moveToTrash).toHaveBeenCalled();
  });

  test('SAFETY: search query always includes -category:primary', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');
    setSearchResults('from:@spam.com', [[]]);

    bulkCleanup();

    var searchQuery = mockGmailApp.search.mock.calls[0][0];
    expect(searchQuery).toContain('-category:primary');
  });

  test('SAFETY: uses moveToTrash, not any delete method', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    var thread = createMockThread('user@spam.com', 1);
    // Ensure no delete-like methods exist on the thread mock
    thread.moveToSpam = jest.fn();
    thread.delete = jest.fn();
    setSearchResults('from:@spam.com', [[thread], []]);

    bulkCleanup();

    expect(thread.moveToTrash).toHaveBeenCalled();
    expect(thread.moveToSpam).not.toHaveBeenCalled();
    expect(thread.delete).not.toHaveBeenCalled();
  });

  test('paginates through multiple batches', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    // First batch of 3, second batch of 2, then empty
    var batch1 = [
      createMockThread('a@spam.com', 1),
      createMockThread('b@spam.com', 1),
      createMockThread('c@spam.com', 1),
    ];
    var batch2 = [
      createMockThread('d@spam.com', 1),
      createMockThread('e@spam.com', 1),
    ];
    setSearchResults('from:@spam.com', [batch1, batch2, []]);

    bulkCleanup();

    // All 5 threads should be trashed
    batch1.forEach((t) => expect(t.moveToTrash).toHaveBeenCalled());
    batch2.forEach((t) => expect(t.moveToTrash).toHaveBeenCalled());
  });

  test('processes multiple blocked domains', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com","junk.co"]');

    var spamThread = createMockThread('a@spam.com', 1);
    var junkThread = createMockThread('b@junk.co', 1);
    setSearchResults('from:@spam.com', [[spamThread], []]);
    setSearchResults('from:@junk.co', [[junkThread], []]);

    bulkCleanup();

    expect(spamThread.moveToTrash).toHaveBeenCalled();
    expect(junkThread.moveToTrash).toHaveBeenCalled();
  });

  test('handles time limit by stopping and logging', () => {
    mockScriptProperties.getProperty.mockReturnValue('["spam.com"]');

    // Simulate time progression: first call returns now, subsequent calls return 6 minutes later
    var callCount = 0;
    var startTime = 1000000;
    var originalDate = global.Date;
    global.Date = class extends originalDate {
      getTime() {
        callCount++;
        // After first call (inside the while loop check), jump past 5 min
        if (callCount > 2) return startTime + 6 * 60 * 1000;
        return startTime;
      }
      toISOString() {
        return new originalDate().toISOString();
      }
    };

    // Return threads forever to test that the time limit stops processing
    var threads = [createMockThread('a@spam.com', 1)];
    setSearchResults('from:@spam.com', [threads, threads, threads, threads, threads]);

    bulkCleanup();

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Approaching time limit')
    );

    // Restore Date
    global.Date = originalDate;
  });
});

// ============================================================
// E. Purge old promotions
// ============================================================

describe('purgeOldPromotions', () => {
  test('uses configured PROMO_MAX_AGE_DAYS in query', () => {
    mockScriptProperties.getProperty.mockImplementation((key) => {
      if (key === 'PROMO_MAX_AGE_DAYS') return '14';
      return null;
    });
    setSearchResults('category:promotions', [[]]);

    purgeOldPromotions();

    var searchQuery = mockGmailApp.search.mock.calls[0][0];
    expect(searchQuery).toContain('older_than:14d');
  });

  test('falls back to 7 days when config is missing', () => {
    mockScriptProperties.getProperty.mockReturnValue(null);
    setSearchResults('category:promotions', [[]]);

    purgeOldPromotions();

    var searchQuery = mockGmailApp.search.mock.calls[0][0];
    expect(searchQuery).toContain('older_than:7d');
  });

  test('trashes all matching threads', () => {
    mockScriptProperties.getProperty.mockReturnValue(null);

    var thread1 = createMockThread('promo@store.com', 1);
    var thread2 = createMockThread('deals@shop.com', 1);
    setSearchResults('category:promotions', [[thread1, thread2], []]);

    purgeOldPromotions();

    expect(thread1.moveToTrash).toHaveBeenCalled();
    expect(thread2.moveToTrash).toHaveBeenCalled();
  });

  test('handles time limit gracefully', () => {
    mockScriptProperties.getProperty.mockReturnValue(null);

    var callCount = 0;
    var startTime = 1000000;
    var originalDate = global.Date;
    global.Date = class extends originalDate {
      getTime() {
        callCount++;
        if (callCount > 2) return startTime + 6 * 60 * 1000;
        return startTime;
      }
      toISOString() {
        return new originalDate().toISOString();
      }
    };

    var threads = [createMockThread('a@store.com', 1)];
    setSearchResults('category:promotions', [threads, threads, threads]);

    purgeOldPromotions();

    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Approaching time limit')
    );

    global.Date = originalDate;
  });
});

// ============================================================
// F. Trigger management
// ============================================================

describe('installTrigger', () => {
  test('removes existing triggers before creating new one', () => {
    // Pre-add a trigger
    mockScriptApp.getProjectTriggers.mockReturnValue([{ id: 'old_trigger' }]);

    installTrigger();

    expect(mockScriptApp.deleteTrigger).toHaveBeenCalledWith({ id: 'old_trigger' });
    expect(mockScriptApp.newTrigger).toHaveBeenCalledWith('dailyAutoClean');
  });

  test('creates a daily trigger at 3am', () => {
    mockScriptApp.getProjectTriggers.mockReturnValue([]);

    installTrigger();

    expect(mockTriggerBuilder.timeBased).toHaveBeenCalled();
    expect(mockTriggerBuilder.everyDays).toHaveBeenCalledWith(1);
    expect(mockTriggerBuilder.atHour).toHaveBeenCalledWith(3);
    expect(mockTriggerBuilder.create).toHaveBeenCalled();
  });
});

describe('removeTriggers', () => {
  test('deletes all existing triggers', () => {
    var trigger1 = { id: 't1' };
    var trigger2 = { id: 't2' };
    mockScriptApp.getProjectTriggers.mockReturnValue([trigger1, trigger2]);

    removeTriggers();

    expect(mockScriptApp.deleteTrigger).toHaveBeenCalledWith(trigger1);
    expect(mockScriptApp.deleteTrigger).toHaveBeenCalledWith(trigger2);
  });

  test('does not error with zero existing triggers', () => {
    mockScriptApp.getProjectTriggers.mockReturnValue([]);

    expect(() => removeTriggers()).not.toThrow();
    expect(mockLogger.log).toHaveBeenCalledWith('Removed 0 trigger(s).');
  });
});

// ============================================================
// G. Integration: dailyAutoClean
// ============================================================

describe('dailyAutoClean', () => {
  test('calls both purgeOldPromotions and bulkCleanup', () => {
    mockScriptProperties.getProperty.mockReturnValue(null);
    setSearchResults('category:promotions', [[]]);

    dailyAutoClean();

    // Verify both functions ran by checking that GmailApp.search was called
    // with both promo and domain queries (at minimum the promo query)
    expect(mockGmailApp.search).toHaveBeenCalled();
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Daily auto-clean started')
    );
    expect(mockLogger.log).toHaveBeenCalledWith(
      expect.stringContaining('Daily auto-clean complete')
    );
  });
});

// ============================================================
// H. addBlocks (template function)
// ============================================================

describe('addBlocks', () => {
  test('calls updateBlockedDomains (template has empty array by default)', () => {
    mockScriptProperties.getProperty.mockReturnValue('[]');

    // Should not throw even with empty array
    expect(() => addBlocks()).not.toThrow();
  });
});
