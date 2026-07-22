import { z } from 'zod';

const DATABASE_ID_RE = /^db_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const DATA_SOURCE_ID_RE = /^ds_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const PROPERTY_ID_RE = /^prop_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const OPTION_ID_RE = /^opt_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const STATUS_GROUP_ID_RE = /^stg_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const RECORD_ID_RE = /^rec_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const VIEW_ID_RE = /^view_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TEMPLATE_ID_RE = /^tpl_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ACTION_BUTTON_ID_RE = /^dbbtn_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const AUTOMATION_ID_RE = /^auto_[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const STABLE_KEY_RE = /^[a-z][a-z0-9]*(?:[_-][a-z0-9]+)*$/;

export const DatabaseIdSchema = z.string().regex(DATABASE_ID_RE);
export const DataSourceIdSchema = z.string().regex(DATA_SOURCE_ID_RE);
export const DatabasePropertyIdSchema = z.string().regex(PROPERTY_ID_RE);
export const DatabaseOptionIdSchema = z.string().regex(OPTION_ID_RE);
export const DatabaseStatusGroupIdSchema = z.string().regex(STATUS_GROUP_ID_RE);
export const DatabaseRecordIdSchema = z.string().regex(RECORD_ID_RE);
export const DatabaseViewIdSchema = z.string().regex(VIEW_ID_RE);
export const DatabaseTemplateIdSchema = z.string().regex(TEMPLATE_ID_RE);
export const DatabaseActionButtonIdSchema = z.string().regex(ACTION_BUTTON_ID_RE);
export const DatabaseAutomationIdSchema = z.string().regex(AUTOMATION_ID_RE);
export const DatabaseStableKeySchema = z.string().min(1).max(128).regex(STABLE_KEY_RE);

export type DatabaseId = z.infer<typeof DatabaseIdSchema>;
export type DataSourceId = z.infer<typeof DataSourceIdSchema>;
export type DatabasePropertyId = z.infer<typeof DatabasePropertyIdSchema>;
export type DatabaseOptionId = z.infer<typeof DatabaseOptionIdSchema>;
export type DatabaseStatusGroupId = z.infer<typeof DatabaseStatusGroupIdSchema>;
export type DatabaseRecordId = z.infer<typeof DatabaseRecordIdSchema>;
export type DatabaseViewId = z.infer<typeof DatabaseViewIdSchema>;
export type DatabaseTemplateId = z.infer<typeof DatabaseTemplateIdSchema>;
export type DatabaseActionButtonId = z.infer<typeof DatabaseActionButtonIdSchema>;
export type DatabaseAutomationId = z.infer<typeof DatabaseAutomationIdSchema>;
