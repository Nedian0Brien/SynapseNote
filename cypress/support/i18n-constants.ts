/**
 * i18n constants for Cypress tests
 * Maps translation keys to their English values for use in tests
 * This ensures tests use i18n keys instead of hardcoded strings
 */

/**
 * Slash menu item names from document.slashMenu.name
 * These correspond to the translation keys in en.json
 */
export const SlashMenuNames = {
    text: 'Text',
    heading1: 'Heading 1',
    heading2: 'Heading 2',
    heading3: 'Heading 3',
    image: 'Image',
    bulletedList: 'Bulleted list',
    numberedList: 'Numbered list',
    todoList: 'To-do list',
    doc: 'Doc',
    linkedDoc: 'Link to page',
    grid: 'Grid',
    linkedGrid: 'Linked Grid',
    kanban: 'Kanban',
    linkedKanban: 'Linked Kanban',
    calendar: 'Calendar',
    linkedCalendar: 'Linked Calendar',
    quote: 'Quote',
    divider: 'Divider',
    table: 'Table',
    callout: 'Callout',
    outline: 'Outline',
    mathEquation: 'Math Equation',
    code: 'Code',
    toggleList: 'Toggle list',
    toggleHeading1: 'Toggle heading 1',
    toggleHeading2: 'Toggle heading 2',
    toggleHeading3: 'Toggle heading 3',
    emoji: 'Emoji',
    aiWriter: 'AI Writer',
    dateOrReminder: 'Date or Reminder',
    photoGallery: 'Photo Gallery',
    file: 'File',
    continueWriting: 'Continue Writing',
    askAIAnything: 'Ask AI Anything',
} as const;

/**
 * Helper function to get slash menu item name by key
 * This provides type safety and ensures we use the correct i18n keys
 */
export function getSlashMenuItemName(key: keyof typeof SlashMenuNames): string {
    return SlashMenuNames[key];
}

