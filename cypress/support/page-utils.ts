/**
 * Page utilities for Cypress E2E tests
 * Separated by functionality and aggregated via TestTool for backward compatibility.
 */

import * as Editor from './page/editor';
import * as Flows from './page/flows';
import * as Modal from './page/modal';
import * as PageActions from './page/page-actions';
import * as Pages from './page/pages';
import * as SharePublish from './page/share-publish';
import * as Sidebar from './page/sidebar';
import * as Workspace from './page/workspace';

export class TestTool {
    // ========== Navigation & Sidebar ==========
    static clickNewPageButton = Sidebar.clickNewPageButton;
    static getSpaceItems = Sidebar.getSpaceItems;
    static clickSpaceItem = Sidebar.clickSpaceItem;
    static getSpaceById = Sidebar.getSpaceById;
    static getSpaceNames = Sidebar.getSpaceNames;
    static getSpaceByName = Sidebar.getSpaceByName;
    static clickSpace = Sidebar.clickSpace;
    static expandSpace = Sidebar.expandSpace;
    static isSpaceExpanded = Sidebar.isSpaceExpanded;

    // ========== Page Management ==========
    static getPageNames = Pages.getPageNames;
    static getPageByName = Pages.getPageByName;
    static clickPageByName = Pages.clickPageByName;
    static getPageById = Pages.getPageById;
    static getPageTitleInput = Pages.getPageTitleInput;
    static enterPageTitle = Pages.enterPageTitle;
    static savePageTitle = Pages.savePageTitle;

    // ========== Page Actions ==========
    static clickPageMoreActions = PageActions.clickPageMoreActions;
    static openViewActionsPopoverForPage = PageActions.openViewActionsPopoverForPage;
    static morePageActionsRename = PageActions.morePageActionsRename;
    static morePageActionsChangeIcon = PageActions.morePageActionsChangeIcon;
    static morePageActionsOpenNewTab = PageActions.morePageActionsOpenNewTab;
    static morePageActionsDuplicate = PageActions.morePageActionsDuplicate;
    static morePageActionsMoveTo = PageActions.morePageActionsMoveTo;
    static morePageActionsDelete = PageActions.morePageActionsDelete;
    static getMorePageActionsRenameButton = PageActions.getMorePageActionsRenameButton;
    static getMorePageActionsChangeIconButton = PageActions.getMorePageActionsChangeIconButton;
    static getMorePageActionsOpenNewTabButton = PageActions.getMorePageActionsOpenNewTabButton;
    static getMorePageActionsDuplicateButton = PageActions.getMorePageActionsDuplicateButton;
    static getMorePageActionsMoveToButton = PageActions.getMorePageActionsMoveToButton;
    static getMorePageActionsDeleteButton = PageActions.getMorePageActionsDeleteButton;
    static clickDeletePageButton = PageActions.clickDeletePageButton;
    static confirmPageDeletion = PageActions.confirmPageDeletion;
    static deletePageByName(pageName: string) {
        Pages.clickPageByName(pageName);
        cy.wait(1000);
        PageActions.clickPageMoreActions();
        cy.wait(500);
        PageActions.clickDeletePageButton();
        cy.wait(500);
        PageActions.confirmPageDeletion();
        return cy.wait(2000);
    }

    // ========== Modal & Share/Publish ==========
    static getModal = Modal.getModal;
    static clickShareButton = Modal.clickShareButton;
    static waitForShareButton = Modal.waitForShareButton;
    static openSharePopover = Modal.openSharePopover;
    static clickModalAddButton = Modal.clickModalAddButton;
    static selectFirstSpaceInModal = Modal.selectFirstSpaceInModal;
    static selectSpace = Modal.selectSpace;
    static publishCurrentPage = SharePublish.publishCurrentPage;
    static clickVisitSite = SharePublish.clickVisitSite;
    static verifyPublishedContentMatches = SharePublish.verifyPublishedContentMatches;
    static unpublishCurrentPageAndVerify = SharePublish.unpublishCurrentPageAndVerify;
    static openPublishSettings = SharePublish.openPublishSettings;
    static unpublishFromSettingsAndVerify = SharePublish.unpublishFromSettingsAndVerify;
    static readPublishUrlFromPanel = SharePublish.readPublishUrlFromPanel;

    // ========== Editor & Content ==========
    static getEditor = Editor.getEditor;
    static getVisibleEditor = Editor.getVisibleEditor;
    static focusEditor = Editor.focusEditor;
    static typeInEditor = Editor.typeInEditor;
    static typeMultipleLinesInEditor = Editor.typeMultipleLinesInEditor;
    static getEditorContent = Editor.getEditorContent;
    static getVisibleEditorContent = Editor.getVisibleEditorContent;
    static verifyEditorContains = Editor.verifyEditorContains;
    static clearEditor = Editor.clearEditor;

    // ========== Flows & Utilities ==========
    static closeDialogIfOpen = Flows.closeDialogIfOpen;
    static focusEditorInDialogIfPresent = Flows.focusEditorInDialogIfPresent;
    static prepareNewPageEditor = Flows.prepareNewPageEditor;
    static typeLinesInVisibleEditor = Flows.typeLinesInVisibleEditor;
    static openPageFromSidebar = Flows.openPageFromSidebar;
    static openFirstAvailablePage = Flows.openFirstAvailablePage;
    static createPage = Flows.createPage;
    static createPageAndAddContent = Flows.createPageAndAddContent;
    static assertEditorContentEquals = Flows.assertEditorContentEquals;
    static waitForPageLoad = Flows.waitForPageLoad;
    static waitForSidebarReady = Flows.waitForSidebarReady;
    static verifyPageExists = Flows.verifyPageExists;
    static verifyPageNotExists = Flows.verifyPageNotExists;

    // ========== Workspace ==========
    static getWorkspaceDropdownTrigger = Workspace.getWorkspaceDropdownTrigger;
    static openWorkspaceDropdown = Workspace.openWorkspaceDropdown;
    static getWorkspaceList = Workspace.getWorkspaceList;
    static getWorkspaceItems = Workspace.getWorkspaceItems;
    static getWorkspaceMemberCounts = Workspace.getWorkspaceMemberCounts;
    static getUserEmailInDropdown = Workspace.getUserEmailInDropdown;

    // ========== Misc ==========
    static tapExc() {
        return cy.focused().type('{esc}');
    }

    static getYDoc() {
        return cy.window().then((win) => {
            const yDoc = (win as any).__currentYDoc;
            if (yDoc) {
                return cy.wrap(yDoc);
            }
            return cy.wrap(null);
        });
    }
}

// Export individual utility functions for convenience (unchanged API)
export const {
    // Navigation
    clickNewPageButton,
    getSpaceItems,
    clickSpaceItem,
    getSpaceById,
    getSpaceNames,
    getSpaceByName,
    clickSpace,

    // Page Management
    getPageNames,
    getPageByName,
    clickPageByName,
    getPageById,
    getPageTitleInput,
    enterPageTitle,
    savePageTitle,

    // Page Actions
    clickPageMoreActions,
    morePageActionsRename,
    morePageActionsChangeIcon,
    morePageActionsOpenNewTab,
    morePageActionsDuplicate,
    morePageActionsMoveTo,
    morePageActionsDelete,
    clickDeletePageButton,
    confirmPageDeletion,
    deletePageByName,

    // Modal
    getModal,
    clickShareButton,
    waitForShareButton,
    openSharePopover,
    publishCurrentPage,
    clickModalAddButton,
    selectFirstSpaceInModal,
    selectSpace,

    // Workspace
    getWorkspaceDropdownTrigger,
    openWorkspaceDropdown,
    getWorkspaceList,
    getWorkspaceItems,
    getWorkspaceMemberCounts,
    getUserEmailInDropdown,

    // Editor
    getEditor,
    getVisibleEditor,
    typeInEditor,
    typeMultipleLinesInEditor,
    getEditorContent,
    getVisibleEditorContent,
    verifyEditorContains,
    getYDoc,
    clearEditor,
    focusEditor,

    // Utilities
    waitForPageLoad,
    waitForSidebarReady,
    verifyPageExists,
    verifyPageNotExists,
    createPage,
    createPageAndAddContent,
    expandSpace,
    openFirstAvailablePage,
    isSpaceExpanded,
} = TestTool;


