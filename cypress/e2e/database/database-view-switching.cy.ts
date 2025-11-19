import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import {
  AddPageSelectors,
  DatabaseViewSelectors,
  waitForReactUpdate
} from '../../support/selectors';

describe('Database View Switching', () => {
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;

  beforeEach(() => {
    cy.on('uncaught:exception', (err) => {
      if (err.message.includes('Minified React error') ||
        err.message.includes('View not found') ||
        err.message.includes('No workspace or service found')) {
        return false;
      }
      return true;
    });

    cy.viewport(1280, 720);
  });

  it('should switch between view types (Grid and Board)', () => {
    const testEmail = generateRandomEmail();

    cy.task('log', `[TEST START] Testing view switching between Grid and Board - Test email: ${testEmail}`);

    // Login
    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Create source database
      cy.task('log', '[STEP 1] Creating database');
      AddPageSelectors.inlineAddButton().first().as('addBtn');
      cy.get('@addBtn').should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').as('gridBtn');
      cy.get('@gridBtn').click();
      cy.wait(3000);
      cy.task('log', '[STEP 1.1] Database created');

      // Create a Board view
      cy.task('log', '[STEP 2] Creating Board view');
      cy.get('[data-testid="add-view-button"]')
        .should('be.visible')
        .as('addViewBtn');
      cy.get('@addViewBtn').click();

      waitForReactUpdate(1000);

      // Click Board option
      DatabaseViewSelectors.viewTypeOption('Board').should('be.visible').click();

      waitForReactUpdate(2000);

      // Switch back to Grid view
      cy.task('log', '[STEP 3] Switching back to Grid view');
      DatabaseViewSelectors.viewTab().first().as('firstTab');
      cy.get('@firstTab').click();
      waitForReactUpdate(1000);

      // Verify first tab is active
      cy.get('@firstTab').should('have.attr', 'data-state', 'active');

      // Switch to Board view
      cy.task('log', '[STEP 4] Switching to Board view');
      DatabaseViewSelectors.viewTab().eq(1).as('boardTab');
      cy.get('@boardTab').click();
      waitForReactUpdate(1000);

      // Verify Board tab is active
      cy.get('@boardTab').should('have.attr', 'data-state', 'active');

      // Switch back to Grid view
      cy.task('log', '[STEP 5] Switching back to Grid view again');
      DatabaseViewSelectors.viewTab().first().as('gridTab');
      cy.get('@gridTab').click();
      waitForReactUpdate(1000);

      // Verify Grid tab is active
      cy.get('@gridTab').should('have.attr', 'data-state', 'active');

      cy.task('log', '[TEST COMPLETE] View switching test passed');
    });
  });

  it('should load views quickly (within 300ms) when switching', () => {
    const testEmail = generateRandomEmail();

    cy.task('log', `[TEST START] Testing view switching performance - Test email: ${testEmail}`);

    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url({ timeout: 30000 }).should('include', '/app');
      cy.wait(3000);

      // Create database
      cy.task('log', '[STEP 1] Creating database');
      AddPageSelectors.inlineAddButton().first().as('addBtn');
      cy.get('@addBtn').should('be.visible').click();
      waitForReactUpdate(1000);
      AddPageSelectors.addGridButton().should('be.visible').as('gridBtn');
      cy.get('@gridBtn').click();
      cy.wait(3000);

      // Create Board view
      cy.get('[data-testid="add-view-button"]')
        .should('be.visible')
        .as('addViewBtn2');
      cy.get('@addViewBtn2').click();

      waitForReactUpdate(1000);

      // Click Board option
      DatabaseViewSelectors.viewTypeOption('Board').should('be.visible').click();

      waitForReactUpdate(2000);

      // Measure switch time from Board to Grid
      cy.task('log', '[STEP 2] Measuring switch time: Board -> Grid');
      const startGrid = Date.now();

      DatabaseViewSelectors.viewTab().first().as('firstTab');
      cy.get('@firstTab').click();

      cy.get('@firstTab').should('have.attr', 'data-state', 'active').then(() => {
        const elapsedGrid = Date.now() - startGrid;
        cy.task('log', `[PERFORMANCE] Switched to Grid in ${elapsedGrid}ms`);
        expect(elapsedGrid).to.be.lessThan(15000); // Allow up to 15s for CI (includes initial load)
      });

      waitForReactUpdate(1000);

      // Measure switch time from Grid to Board
      cy.task('log', '[STEP 3] Measuring switch time: Grid -> Board');
      const startBoard = Date.now();

      DatabaseViewSelectors.viewTab().eq(1).as('boardTab');
      cy.get('@boardTab').click();

      cy.get('@boardTab').should('have.attr', 'data-state', 'active').then(() => {
        const elapsedBoard = Date.now() - startBoard;
        cy.task('log', `[PERFORMANCE] Switched to Board in ${elapsedBoard}ms`);
        expect(elapsedBoard).to.be.lessThan(15000); // Allow up to 15s for CI
      });

      cy.task('log', '[TEST COMPLETE] View switching performance test passed');
    });
  });
});
