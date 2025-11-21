# Embedded Database E2E Test Cases

## Overview
This document outlines the test cases for embedded database functionality, covering all the issues we fixed in the recent development cycle.

## Test Categories

### 1. Linked Database View Creation via Slash Menu
**File:** `linked-database-slash-menu.cy.ts`

#### Test Case 1.1: Create linked database view via slash menu
- **Description**: User creates a linked database view using the slash menu (/) command
- **Steps**:
  1. Login and navigate to a document
  2. Type "/" to open slash menu
  3. Select "Link to Database" option
  4. Choose an existing database from the list
  5. Select the view type (Grid/Board/Calendar)
- **Expected Result**:
  - Linked database block appears within 100-500ms (no 10-second loading delay)
  - Database content is displayed immediately
  - No page refresh required
- **Relates to Fix**: Retry logic with exponential backoff (100ms → 300ms → 1s → 3s → 5s)

#### Test Case 1.2: Verify retry mechanism for slow sync
- **Description**: Ensure retry logic works when server sync is slower than expected
- **Steps**:
  1. Simulate slow network conditions (optional)
  2. Create linked database via slash menu
  3. Monitor console logs for retry attempts
- **Expected Result**:
  - Multiple retry attempts logged if needed
  - Successfully loads within retry window
  - Max 5 attempts with exponential backoff

---

### 2. Linked Database View Creation via Plus Button
**File:** `linked-database-plus-button.cy.ts`

#### Test Case 2.1: Create new view using + button
- **Description**: User creates a new database view using the "+" button next to existing tabs
- **Steps**:
  1. Open an existing database
  2. Click the "+" button next to the view tabs
  3. Select view type (Grid/Board/Calendar)
- **Expected Result**:
  - New view tab appears immediately (within 200-500ms)
  - **New view is automatically selected (becomes active tab)**
  - View automatically scrolls into view if tabs overflow
  - No page refresh required
- **Relates to Fix**: View sync waiting logic in DatabaseTabs.tsx

#### Test Case 2.2: Verify tab selection after creation
- **Description**: Ensure newly created view is selected and visible
- **Steps**:
  1. Create multiple views to ensure horizontal scrolling
  2. Click "+" to create a new view
  3. Verify the new tab is selected
- **Expected Result**:
  - New tab has active state (highlighted)
  - Tab is scrolled into visible area
  - Database content shows the new view

#### Test Case 2.3: Verify view synchronization timing
- **Description**: Test that view appears in tabs only after Yjs sync completes
- **Steps**:
  1. Click "+" button
  2. Monitor DOM for tab element creation
- **Expected Result**:
  - Tab element appears after Yjs sync (not before)
  - No "flash of missing content"
  - Smooth transition

---

### 3. Database View Switching
**File:** `database-view-switching.cy.ts`

#### Test Case 3.1: Switch between different view types
- **Description**: User switches between Grid, Board, and Calendar views
- **Steps**:
  1. Create a database with multiple views (Grid, Board, Calendar)
  2. Click on each tab to switch views
  3. Verify view content loads correctly
- **Expected Result**:
  - Each view loads within 100-300ms
  - Scroll position is maintained when switching back
  - No loading indicator stuck on screen
  - Height adjusts naturally to view content

#### Test Case 3.2: Verify scroll position restoration
- **Description**: Ensure scroll position is maintained when switching views
- **Steps**:
  1. Open a Grid view with many rows
  2. Scroll down to middle of the list
  3. Switch to Board view
  4. Switch back to Grid view
- **Expected Result**:
  - Grid view restores to the same scroll position
  - No jump to top of page
  - Smooth transition without flicker

---

### 4. Filters and Sorts UI
**File:** `database-conditions.cy.ts`

#### Test Case 4.1: DatabaseConditions height when collapsed
- **Description**: Verify that filters/sorts area doesn't take space when empty
- **Steps**:
  1. Open a database with no filters or sorts
  2. Measure the space between tabs and database content
- **Expected Result**:
  - **No 40px gap below the tabs**
  - DatabaseConditions height is 0px when not expanded
  - Database content starts immediately below tabs

#### Test Case 4.2: DatabaseConditions height when expanded
- **Description**: Verify filters/sorts area expands correctly
- **Steps**:
  1. Add a filter to the database
  2. Observe the filters/sorts area
- **Expected Result**:
  - DatabaseConditions expands to 40px height
  - Filters are visible and interactive
  - No extra empty space below

#### Test Case 4.3: Dynamic height adjustment
- **Description**: Ensure height adjusts when filters/sorts are added or removed
- **Steps**:
  1. Start with no filters
  2. Add a filter
  3. Remove the filter
- **Expected Result**:
  - Height changes from 0px → 40px → 0px
  - Smooth transition
  - No layout shift or jank
  - Database content adjusts naturally

---

### 5. Embedded Database Height Management
**File:** `embedded-database-height.cy.ts`

#### Test Case 5.1: Height lock only during transitions
- **Description**: Verify height is only locked during view switching
- **Steps**:
  1. Create an embedded database in a document
  2. Switch between views
  3. Add/remove filters
- **Expected Result**:
  - Height is locked only while `isLoading = true`
  - Height is released after view loads
  - **No large empty space below database when filters expand**
  - Content adjusts naturally to filter/sort changes

#### Test Case 5.2: Fixed height for embedded databases
- **Description**: Ensure embedded databases respect fixed height prop
- **Steps**:
  1. Create embedded database with fixed height
  2. Add filters and sorts
  3. Switch views
- **Expected Result**:
  - Fixed height is maintained
  - Scroll appears inside database if content overflows
  - Height doesn't change with filters/sorts

#### Test Case 5.3: Natural height for standalone databases
- **Description**: Ensure standalone database pages use natural height
- **Steps**:
  1. Open a database as a full page (not embedded)
  2. Add/remove filters
  3. Switch views
- **Expected Result**:
  - No height locking after view loads
  - Content expands/contracts naturally
  - No unnecessary empty space

---

### 6. Integration Tests
**File:** `embedded-database-integration.cy.ts`

#### Test Case 6.1: Complete workflow - Create and use embedded database
- **Description**: End-to-end test of embedded database lifecycle
- **Steps**:
  1. Create a new document
  2. Use slash menu to insert linked database
  3. Create additional views using + button
  4. Switch between views
  5. Add filters and sorts
  6. Remove filters and sorts
- **Expected Result**:
  - All operations complete smoothly
  - No stuck loading indicators
  - No unnecessary empty space
  - Proper height management throughout

#### Test Case 6.2: Performance - View creation timing
- **Description**: Ensure view creation meets performance targets
- **Steps**:
  1. Measure time from clicking + button to view appearing
  2. Measure time from slash menu selection to database appearing
- **Expected Result**:
  - Plus button: View appears within 200-500ms
  - Slash menu: Database appears within 100-500ms
  - Both complete within retry timeout (9.4s max, typically <500ms)

---

## Test Data Requirements

### Prerequisites
- Test account with permissions to create databases
- Workspace with existing databases for linking
- Test databases with:
  - Multiple views (Grid, Board, Calendar)
  - Sample data (at least 10 rows)
  - Various column types

### Test Utilities Needed
- `waitForViewSync()` - Wait for Yjs synchronization
- `measureHeight()` - Measure element heights
- `checkTabSelected()` - Verify tab selection state
- `waitForDatabaseLoad()` - Wait for database content to load

---

## Known Issues to Verify Fixed

1. ✅ **10-second loading delay** - Reduced to 100-500ms with exponential backoff
2. ✅ **View not appearing after + button** - Fixed with view sync waiting logic
3. ✅ **View not selected after creation** - Fixed with explicit selection logic
4. ✅ **40px gap with no filters** - Fixed by collapsing DatabaseConditions to 0 height
5. ✅ **Empty space with filters** - Fixed by only locking height during transitions

---

## Console Logs to Monitor

Watch for these debug messages during tests:

### Slash Menu Creation
```
[useRetryFunction] Retry attempt 1 after 100ms
[DatabaseBlock] loaded view doc
[DatabaseBlock] database found in doc
```

### Plus Button Creation
```
[DatabaseTabs] Waiting for view sync...
[DatabaseTabs] View synced to Yjs
[DatabaseTabs] View DOM element found
[DatabaseTabs] Selecting new view
[DatabaseTabs] Scrolling to view
```

### View Switching
```
[DatabaseViews] captured scroll before view change
[DatabaseViews] handleViewChange height lock
[DatabaseViews] RAF restore scroll
[DatabaseViews] scroll restoration completed
```

---

## Success Criteria

All tests should pass with:
- ✅ No timeouts (tests complete within reasonable time)
- ✅ No flaky failures (tests are deterministic)
- ✅ No console errors (except expected/handled)
- ✅ Performance targets met (view creation < 500ms)
- ✅ UI behaves as expected (no visual glitches)
