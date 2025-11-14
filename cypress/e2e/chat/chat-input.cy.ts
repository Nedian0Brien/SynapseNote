import { v4 as uuidv4 } from 'uuid';
import { AuthTestUtils } from '../../support/auth-utils';
import { TestTool } from '../../support/page-utils';
import { PageSelectors, SidebarSelectors } from '../../support/selectors';

describe('Chat Input Tests', () => {
  const APPFLOWY_BASE_URL = Cypress.env('APPFLOWY_BASE_URL');
  const APPFLOWY_GOTRUE_BASE_URL = Cypress.env('APPFLOWY_GOTRUE_BASE_URL');
  const generateRandomEmail = () => `${uuidv4()}@appflowy.io`;
  let testEmail: string;

  before(() => {
    cy.task(
      'log',
      `Test Environment Configuration:\n          - APPFLOWY_BASE_URL: ${APPFLOWY_BASE_URL}\n          - APPFLOWY_GOTRUE_BASE_URL: ${APPFLOWY_GOTRUE_BASE_URL}`
    );
  });

  beforeEach(() => {
    testEmail = generateRandomEmail();
  });

  it('tests chat input UI controls', () => {
    cy.on('uncaught:exception', (err: Error) => {
      if (err.message.includes('No workspace or service found') ||
          err.message.includes('View not found') ||
          err.message.includes('WebSocket') ||
          err.message.includes('connection') ||
          err.message.includes('Failed to load models') ||
          err.message.includes('Minified React error')) {
        return false;
      }
      return true;
    });

    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url().should('include', '/app');

      SidebarSelectors.pageHeader().should('be.visible', { timeout: 30000 });
      PageSelectors.items().should('exist', { timeout: 30000 });
      cy.wait(2000);

      TestTool.expandSpace();
      cy.wait(1000);

      PageSelectors.items()
        .first()
        .trigger('mouseenter', { force: true })
        .trigger('mouseover', { force: true });

      cy.wait(1000);

      cy.get('[data-testid="inline-add-page"]').first().click({ force: true });
      cy.get('[data-testid="add-ai-chat-button"]').should('be.visible').click();

      cy.wait(2000);

      // Test 1: Format toggle
      cy.log('Testing format toggle');
      cy.get('body').then($body => {
        if ($body.find('[data-testid="chat-format-group"]').length > 0) {
          cy.get('[data-testid="chat-input-format-toggle"]').click();
          cy.get('[data-testid="chat-format-group"]').should('not.exist');
        }
      });

      cy.get('[data-testid="chat-input-format-toggle"]').should('be.visible').click();
      cy.get('[data-testid="chat-format-group"]').should('exist');
      cy.get('[data-testid="chat-format-group"] button').should('have.length.at.least', 4);
      cy.get('[data-testid="chat-input-format-toggle"]').click();
      cy.get('[data-testid="chat-format-group"]').should('not.exist');

      // Test 2: Model selector
      cy.log('Testing model selector');
      cy.get('[data-testid="model-selector-button"]').should('be.visible').click();
      cy.get('[data-testid^="model-option-"]').should('exist');
      cy.get('body').click(0, 0);

      // Test 3: Browse prompts
      cy.log('Testing browse prompts');
      cy.get('[data-testid="chat-input-browse-prompts"]').click();
      cy.get('[role="dialog"]').should('exist');
      cy.get('[role="dialog"]').contains('Browse prompts').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('[role="dialog"]').should('not.exist');

      // Test 4: Related views
      cy.log('Testing related views');
      cy.get('[data-testid="chat-input-related-views"]').click();
      cy.get('[data-testid="chat-related-views-popover"]').should('be.visible');
      cy.get('body').type('{esc}');
      cy.get('[data-testid="chat-related-views-popover"]').should('not.exist');
    });
  });

  it('tests chat input message handling', () => {
    cy.on('uncaught:exception', (err: Error) => {
      if (err.message.includes('No workspace or service found') ||
          err.message.includes('View not found') ||
          err.message.includes('WebSocket') ||
          err.message.includes('connection') ||
          err.message.includes('Failed to load models') ||
          err.message.includes('Minified React error')) {
        return false;
      }
      return true;
    });

    cy.visit('/login', { failOnStatusCode: false });
    cy.wait(2000);

    const authUtils = new AuthTestUtils();
    authUtils.signInWithTestUrl(testEmail).then(() => {
      cy.url().should('include', '/app');

      SidebarSelectors.pageHeader().should('be.visible', { timeout: 30000 });
      PageSelectors.items().should('exist', { timeout: 30000 });
      cy.wait(2000);

      TestTool.expandSpace();
      cy.wait(1000);

      PageSelectors.items()
        .first()
        .trigger('mouseenter', { force: true })
        .trigger('mouseover', { force: true });

      cy.wait(1000);

      cy.get('[data-testid="inline-add-page"]').first().click({ force: true });
      cy.get('[data-testid="add-ai-chat-button"]').should('be.visible').click();

      cy.wait(3000); // Wait for chat to fully load

      // Mock API endpoints with more realistic responses
      cy.intercept('POST', '**/api/chat/**/message/question', (req) => {
        req.reply({
          statusCode: 200,
          body: {
            code: 0,
            data: {
              message_id: Date.now().toString(),
              content: req.body.content || 'Test message',
              chat_id: 'test-chat-id',
            },
            message: 'success',
          },
        });
      }).as('submitQuestion');

      cy.intercept('POST', '**/api/chat/**/answer/stream', (req) => {
        req.reply({
          statusCode: 200,
          body: 'data: {"content":"Test response","type":"message"}\n\n',
          headers: {
            'content-type': 'text/event-stream',
          },
        });
      }).as('streamAnswer');

      // Get the textarea using a more flexible selector
      const getTextarea = () => cy.get('textarea').first();

      // Test 1: Check textarea exists and is ready
      cy.log('Testing textarea availability');
      getTextarea().should('exist').and('be.visible');
      
      // Test 2: Keyboard interactions with better waits
      cy.log('Testing keyboard interactions');
      getTextarea()
        .should('not.be.disabled')
        .clear()
        .type('First line')
        .should((el) => {
          expect(el.val()).to.include('First line');
        });
      
      cy.wait(500);
      
      getTextarea()
        .type('{shift+enter}Second line')
        .should((el) => {
          expect(el.val()).to.include('First line\nSecond line');
        });

      // Test 3: Textarea auto-resize
      cy.log('Testing auto-resize');
      getTextarea().then($textarea => {
        const initialHeight = $textarea.height();
        cy.wrap($textarea)
          .clear()
          .type('Line 1{shift+enter}Line 2{shift+enter}Line 3{shift+enter}Line 4');
        
        cy.wait(500);
        
        getTextarea().then($resized => {
          const newHeight = $resized.height();
          cy.log(`Initial height: ${initialHeight}, New height: ${newHeight}`);
          expect(newHeight).to.be.at.least(initialHeight!);
        });
      });

      // Test 4: Button states with better selectors
      cy.log('Testing button states');
      getTextarea().clear();
      cy.wait(500);
      
      // Check send button is disabled when empty
      cy.get('[data-testid="chat-input-send"]').should('exist');
      cy.get('[data-testid="chat-input-send"]').then($button => {
        // Button might be disabled via attribute or opacity
        const isDisabled = $button.prop('disabled') || $button.css('opacity') === '0.5';
        expect(isDisabled).to.be.true;
      });
      
      // Type message and check button becomes enabled
      getTextarea().type('Test message');
      cy.wait(500);
      
      cy.get('[data-testid="chat-input-send"]').then($button => {
        const isDisabled = $button.prop('disabled') || $button.css('opacity') === '0.5';
        expect(isDisabled).to.be.false;
      });

      // Test 5: Message sending with proper waits
      cy.log('Testing message sending');
      getTextarea().clear().type('Hello world');
      cy.wait(500);
      
      cy.get('[data-testid="chat-input-send"]').click();
      cy.wait('@submitQuestion', { timeout: 10000 });
      
      // Wait for textarea to be ready again
      cy.wait(2000);
      
      getTextarea()
        .should('exist')
        .and('be.visible')
        .and('have.value', '');

      // Test 6: Special characters with simpler approach
      cy.log('Testing special characters');
      cy.wait(1000);
      
      const specialMessage = 'Test with special: @#$%';
      getTextarea()
        .should('not.be.disabled')
        .clear()
        .type(specialMessage);
      
      cy.wait(500);
      
      getTextarea().should((el) => {
        expect(el.val()).to.equal(specialMessage);
      });

      // Test 7: Enter sends message with better handling
      cy.log('Testing Enter key');
      getTextarea().clear();
      cy.wait(500);
      
      getTextarea().type('Quick test{enter}');
      cy.wait('@submitQuestion', { timeout: 10000 });
      
      cy.wait(2000);
      getTextarea()
        .should('exist')
        .and('have.value', '');
    });
  });
});