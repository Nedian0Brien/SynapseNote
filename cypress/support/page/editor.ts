/// <reference types="cypress" />

export function getEditor(viewId?: string) {
    if (viewId) {
        return cy.get(`#editor-${viewId}`);
    }
    return cy.get('[id^="editor-"]').first();
}

export function getVisibleEditor() {
    return cy.get('body').then(($body) => {
        const hasDialogEditor = $body.find('[role="dialog"] [data-testid="editor-content"]').length > 0;
        if (hasDialogEditor) {
            return cy.get('[role="dialog"]').find('[data-testid="editor-content"]').first();
        }
        return cy
            .get('[data-testid="editor-content"]')
            .then(($editors) => {
                const $visible = $editors.filter(':visible');
                if ($editors.length > 1) {
                    cy.task('log', `WARNING: Found ${$editors.length} editors on the page, using ${$visible.length > 0 ? 'first visible' : 'first'} one`);
                }
                return cy.wrap($visible.length > 0 ? $visible : $editors);
            })
            .first();
    });
}

export function focusEditor() {
    return cy.get('[data-testid="editor-content"]', { timeout: 10000 })
        .should('exist')
        .click({ force: true })
        .focus();
}

export function typeInEditor(content: string) {
    return getEditor().should('be.visible').focus().type(content);
}

export function typeMultipleLinesInEditor(lines: string[]) {
    return getEditor()
        .should('be.visible')
        .focus()
        .then(($editor) => {
            lines.forEach((line, index) => {
                if (index > 0) {
                    cy.wrap($editor).type('{enter}');
                }
                cy.wrap($editor).type(line);
            });
        });
}

export function getEditorContent() {
    return getEditor().invoke('text');
}

export function getVisibleEditorContent() {
    return cy.window().then((win) => {
        const yDoc = (win as any).__currentYDoc;
        if (!yDoc) {
            return cy.wrap(null).then(() => {
                cy.task('log', 'WARNING: YDoc not available, falling back to DOM text extraction');
                return getVisibleEditor().invoke('text');
            });
        }
        try {
            const root = yDoc.getMap('data');
            const document = root?.get('document');
            if (!root || !document) {
                return cy.wrap(null).then(() => {
                    cy.task('log', 'WARNING: YDoc missing data/document, falling back to DOM text');
                    return getVisibleEditor().invoke('text');
                });
            }
            const blocks = document.get('blocks');
            const meta = document.get('meta');
            const childrenMap = meta?.get('children_map');
            const textMap = meta?.get('text_map');
            const pageId = document.get('page_id');
            if (!blocks || !childrenMap || !textMap || !pageId) {
                return cy.wrap(null).then(() => {
                    cy.task('log', 'WARNING: Missing blocks/children_map/text_map/page_id in YDoc, falling back to DOM text');
                    return getVisibleEditor().invoke('text');
                });
            }
            const visited = new Set<string>();
            const collectFromChildren = (parentId: string): string[] => {
                const children = childrenMap.get(parentId);
                const childrenArr: string[] = children?.toArray?.() ?? [];
                if (childrenArr.length === 0) return [];
                const lines: string[] = [];
                for (const childId of childrenArr) {
                    if (visited.has(childId)) continue;
                    visited.add(childId);
                    const block = blocks.get(childId);
                    const externalId = block?.get('external_id');
                    const ytext = externalId ? textMap.get(externalId) : undefined;
                    const textLine = typeof ytext?.toString === 'function' ? ytext.toString() : '';
                    if (textLine) lines.push(textLine);
                    const nested = collectFromChildren(childId);
                    if (nested.length) lines.push(...nested);
                }
                return lines;
            };
            const lines = collectFromChildren(pageId);
            const textContent = lines.join('\n');
            return cy.wrap(textContent).then((content) => {
                if (!content || content.length === 0) {
                    return cy.task('log', 'YDoc content empty, falling back to DOM text').then(() =>
                        getVisibleEditor().invoke('text')
                    );
                }
                return cy.task('log', `YDoc content extracted (${content.length} chars)`).then(() => cy.wrap(content));
            });
        } catch (error) {
            return cy.wrap(null).then(() => {
                cy.task('log', `Error extracting content from YDoc: ${error}`);
                return getVisibleEditor().invoke('text');
            });
        }
    });
}

export function verifyEditorContains(text: string) {
    return getVisibleEditor().should('contain', text);
}

export function clearEditor() {
    return getEditor().focus().type('{selectall}{backspace}');
}


