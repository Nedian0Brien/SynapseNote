export type { Principal } from '@nedian0brien/synapsenote-core';
export {
  GitDirAccessError,
  MalformedGitPointerError,
} from '@nedian0brien/synapsenote-core/shadow-repo-layout';
export { AgentFocusBroadcaster } from './agent-focus.ts';
export {
  AGENT_ID_MAX_LEN,
  AGENT_ID_RE,
  toBroadcasterKey,
  validateAgentId,
} from './agent-id.ts';
export { AgentPresenceBroadcaster } from './agent-presence.ts';
export {
  AGENT_WRITE_ORIGIN,
  type AgentDirectConnection,
  AgentSessionCapacityError,
  type AgentSessionIdentity,
  AgentSessionManager,
  applyAgentMarkdownWrite,
  colorFromSeed,
  iconFromClientName,
  MAX_AGENT_SESSIONS,
} from './agent-sessions.ts';
export {
  __getShowAllWalkStatsForTesting,
  __resetShowAllWalkStatsForTesting,
  type ApiExtensionOptions,
  createApiExtension,
  MANAGED_RENAME_ORIGIN,
  ROLLBACK_ORIGIN,
  safeSubdir,
} from './api-extension.ts';
export { isAllowedApiOrigin } from './api-origin.ts';
export {
  type AssetServeFilter,
  createAssetServeMiddleware,
  type SirvLikeMiddleware,
} from './asset-serve-middleware.ts';
export { seedBasenameIndex } from './asset-walk.ts';
export {
  formatAuthRejectionWire,
  HOCUSPOCUS_AUTH_REJECTION_REASONS,
  HocuspocusAuthRejection,
  type HocuspocusAuthRejectionReason,
  type HocuspocusAuthToken,
  HocuspocusAuthTokenSchema,
  isHocuspocusAuthRejectionReason,
  LINEAGE_EPOCH_KEY,
  parseAuthRejectionWire,
  parseHocuspocusAuthToken,
} from './auth-token-schema.ts';
export { AutoStartDisabledError } from './autostart.ts';
export {
  type BacklinkEntry,
  BacklinkIndex,
  type ExtractedWikiLink,
  extractWikiLinksFromMarkdown,
  type HubEntry,
  isOrphanMode,
  ORPHAN_MODES,
  type OrphanMode,
} from './backlink-index.ts';
export {
  type BootedServer,
  type BootServerOptions,
  bootServer,
  restoreLifecycleFromConflictsJson,
} from './boot.ts';
export {
  type BuildSkillZipOptions,
  type BuildSkillZipResult,
  type BundleId,
  buildSkillZip,
  type ResolveBundledSkillDirOptions,
  resolveBundledSkillDir,
  validateSkillZip,
} from './build-skill-zip.ts';
export {
  CC1_CONTRACT_VERSION,
  CC1Broadcaster,
  isConfigDoc,
  isLinkIndexExcludedDoc,
  isManagedArtifactDoc,
  isReservedForUserTree,
  isSystemDoc,
  SYSTEM_DOC_NAME,
} from './cc1-broadcast.ts';
export {
  type HiddenWindowsConsoleOptions,
  withHiddenWindowsConsole,
} from './child-process-windows-hide.ts';
export {
  getLocalDir,
  resolveContentDir,
  resolveLockDir,
} from './config/paths.ts';
export { type Config, ConfigSchema } from './config/schema.ts';
export { MCP_SERVER_NAME } from './constants.ts';
export {
  type ContentFilter,
  type ContentFilterOptions,
  createContentFilter,
  createContentFilterAsync,
  type RebuildResult as ContentFilterRebuildResult,
} from './content-filter.ts';
export {
  // Back-compat public export; new code should use swapContributors().
  // oxlint-disable-next-line typescript/no-deprecated
  clearContributors,
  contributorCount,
  // Back-compat public export; new code should use formatContributorsFrom().
  // oxlint-disable-next-line typescript/no-deprecated
  formatContributors,
  formatContributorsFrom,
  recordContributor,
  restoreContributors,
  swapContributors,
} from './contributor-tracker.ts';
export {
  createDatabaseAgentPromptRetentionStore,
  DATABASE_AGENT_PROMPT_RETENTION_MAX_SECONDS,
  DatabaseAgentPromptRetentionError,
  type DatabaseAgentPromptRetentionErrorCode,
  type DatabaseAgentPromptRetentionMetadata,
  DatabaseAgentPromptRetentionStore,
} from './database-agent-prompt-retention.ts';
export {
  createDatabaseAgentRunStore,
  type DatabaseAgentRunPlanBundle,
  DatabaseAgentRunStore,
  DatabaseAgentRunStoreError,
  type DatabaseAgentRunStoreErrorCode,
} from './database-agent-run-store.ts';
export {
  type CreateDatabaseAutomationServiceOptions,
  createDatabaseAutomationService,
  type DatabaseAutomationEvent,
  DatabaseAutomationEventSchema,
  type DatabaseAutomationPlan,
  type DatabaseAutomationRun,
  DatabaseAutomationRunSchema,
  DatabaseAutomationService,
  type EnqueueDatabaseAutomationEventInput,
} from './database-automation.ts';
export {
  createDatabaseAutomationNotificationStore,
  type DatabaseAutomationNotification,
  DatabaseAutomationNotificationSchema,
  DatabaseAutomationNotificationStore,
} from './database-automation-notification-store.ts';
export {
  createDatabaseAutonomyStore,
  type DatabaseAutonomyState,
  DatabaseAutonomyStore,
  DatabaseAutonomyStoreError,
  type DatabaseAutonomyStoreErrorCode,
  type ResolvedDatabaseAutonomyPolicy,
  type SetDatabaseAutonomySessionPolicyResult,
} from './database-autonomy-store.ts';
export * from './database-benchmark-corpus.ts';
export {
  type CreateDatabaseButtonPlannerOptions,
  createDatabaseButtonPlanner,
  type DatabaseButtonExternalStep,
  type DatabaseButtonPermissionDecision,
  type DatabaseButtonPermissionRequest,
  type DatabaseButtonPlan,
  DatabaseButtonPlanError,
  type DatabaseButtonPlanErrorCode,
  type DatabaseButtonPlanInput,
  DatabaseButtonPlanInputSchema,
  DatabaseButtonPlanner,
  type ResolveDatabaseButtonPermission,
} from './database-button.ts';
export {
  type CreateDatabaseButtonExecutorOptions,
  createDatabaseButtonExecutor,
  DatabaseButtonExecutionError,
  type DatabaseButtonExecutionErrorCode,
  type DatabaseButtonExecutionInput,
  DatabaseButtonExecutionInputSchema,
  DatabaseButtonExecutor,
  type DatabaseButtonRun,
  DatabaseButtonRunSchema,
} from './database-button-executor.ts';
export {
  type CreateDatabaseCommentStoreOptions,
  createDatabaseCommentStore,
  type DatabaseCommentAction,
  type DatabaseCommentRecordContext,
  type DatabaseCommentSnapshot,
  DatabaseCommentStore,
  DatabaseCommentStoreError,
} from './database-comment-store.ts';
export {
  type CreateDatabaseCommitEngineOptions,
  createDatabaseCommitEngine,
  type DatabaseCommitAutonomyPolicy,
  DatabaseCommitEngine,
  DatabaseCommitError,
  type DatabaseCommitErrorCode,
  type DatabaseCommitInput,
  type DatabaseCommitResult,
  type DatabaseUndoInput,
  type DatabaseUndoResult,
  type ResolveDatabaseCommitAutonomyPolicy,
} from './database-commit.ts';
export {
  createDatabaseConnectionExecutor,
  DatabaseConnectionExecutor,
} from './database-connection-executor.ts';
export {
  DATABASE_CONTEXT_INSPECTION_LIMIT,
  type DatabaseContextInspection,
  type DatabaseContextInspectionScope,
  type DatabaseContextInspectionSummary,
  DatabaseContextInspector,
} from './database-context-inspector.ts';
export {
  type ColumnarDatabaseRecords,
  createDatabaseContextPack,
  type DatabaseContextPack,
  type DatabaseContextPackAgentView,
  type DatabaseContextPackEncoding,
  DatabaseContextPackError,
  type DatabaseContextPackErrorCode,
  type DatabaseContextPackInput,
  type DatabaseContextPackRetrieval,
  type DatabaseContextPackTokenizer,
  type DatabaseRelationExpansion,
  type DatabaseRelationExpansionInput,
  type DatabaseRelationProjection,
  decodeColumnarDatabaseRecords,
} from './database-context-pack.ts';
export {
  type AppliedDatabaseAgentView,
  type AppliedDatabaseSavedQuery,
  type CreateDatabaseDataPlaneOptions,
  createDatabaseDataPlane,
  type DatabaseCatalogEntry,
  type DatabaseCatalogMatchField,
  type DatabaseCatalogNotModifiedResult,
  type DatabaseCatalogResult,
  type DatabaseCatalogSourceCard,
  type DatabaseComputedPropertyPreviewResult,
  DatabaseDataPlane,
  DatabaseDataPlaneError,
  type DatabaseDataPlaneErrorCode,
  type DatabaseDataPlaneLexicalSearchResult,
  type DatabaseDataPlanePackInput,
  type DatabaseDataPlaneQueryResult,
  type DatabaseDataPlaneRetrievalResult,
  type DatabaseDescribeNotModifiedResult,
  type DatabaseDescribeResult,
  type DatabaseFindResult,
  type DatabasePropertyConversionPlanPreview,
  type DatabasePublicShareTargetResolution,
  type DatabaseQueryAccessDecision,
  type DatabaseQueryDelta,
  type DatabaseQueryDeltaReceipt,
  type DatabaseQueryExplainTrace,
  type DatabaseQueryPermissionExclusions,
  type DatabaseQueryResultState,
  type DatabaseRetrievalMode,
  type ResolveDatabaseGlobalAccess,
  type ResolveDatabaseQueryAccess,
} from './database-data-plane.ts';
export {
  createDatabaseDataPlaneApiHandlers,
  DATABASE_API_SCHEMA_VERSION,
  DATABASE_API_SCHEMA_VERSION_HEADER,
  DATABASE_API_SCHEMAS,
  DatabaseAgentRunsRequestSchema,
  DatabaseAgentRunsResponseSchema,
  DatabaseAutonomyRequestSchema,
  DatabaseAutonomyResponseSchema,
  DatabaseButtonRequestSchema,
  DatabaseButtonResponseSchema,
  DatabaseCatalogRequestSchema,
  DatabaseCatalogResponseSchema,
  DatabaseCommitRequestSchema,
  DatabaseCommitResponseSchema,
  DatabaseComputedPropertyPreviewRequestSchema,
  DatabaseComputedPropertyPreviewResponseSchema,
  DatabaseContextInspectionRequestSchema,
  DatabaseContextInspectionResponseSchema,
  DatabaseContextPackRequestSchema,
  DatabaseContextPackResponseSchema,
  type DatabaseDataPlaneApiHandlers,
  DatabaseDescribeRequestSchema,
  DatabaseDescribeResponseSchema,
  DatabaseDiagnosticsResponseSchema,
  type DatabaseDiagnosticsResult,
  DatabaseFindRequestSchema,
  DatabaseFindResponseSchema,
  DatabaseManifestMigrationPreviewSchema,
  DatabaseOnboardingPreviewSchema,
  DatabasePlanRequestSchema,
  DatabasePlanResponseSchema,
  DatabasePublicSharesRequestSchema,
  DatabasePublicSharesResponseSchema,
  DatabaseQueryRequestSchema,
  DatabaseQueryResponseSchema,
  DatabaseRepairRequestSchema,
  DatabaseRepairResponseSchema,
  DatabaseRetrieveRequestSchema,
  DatabaseRetrieveResponseSchema,
  type DatabaseTask,
  type DatabaseTaskRequest,
  DatabaseTaskRequestSchema,
  type DatabaseTaskResponse,
  DatabaseTaskResponseSchema,
  DatabaseTaskSchema,
  DatabaseTemplateRunsRequestSchema,
  DatabaseTemplateRunsResponseSchema,
  DatabaseUndoRequestSchema,
  DatabaseUndoResponseSchema,
} from './database-data-plane-api.ts';
export {
  type CreateDatabaseFormRetentionServiceOptions,
  createDatabaseFormRetentionService,
  DatabaseFormRetentionService,
} from './database-form-retention.ts';
export {
  createDatabaseFormStateStore,
  type DatabaseFormReceipt,
  DatabaseFormStateStore,
  type DatabaseFormStoredResult,
  databaseFormPrivateKey,
  type ReserveDatabaseFormReceiptInput,
} from './database-form-state-store.ts';
export {
  type CreateDatabaseGitRecoveryOptions,
  createDatabaseGitRecoveryService,
  type DatabaseGitOperation,
  DatabaseGitRecoveryService,
  type DatabaseGitRecoveryStatus,
} from './database-git-recovery.ts';
export * from './database-lifecycle-benchmark.ts';
export {
  type MarkdownFolderDatabasePreview,
  type PreviewMarkdownFolderDatabaseInput,
  previewMarkdownFolderDatabase,
} from './database-markdown-import.ts';
export * from './database-performance-benchmark.ts';
export {
  createDatabasePermissionStore,
  type DatabasePermissionGrant,
  type DatabasePermissionState,
  DatabasePermissionStore,
  DatabasePermissionStoreError,
} from './database-permission-store.ts';
export {
  createDatabasePlaceSearchService,
  createDatabasePlaceSearchServiceFromEnv,
  createNominatimPlaceSearchProvider,
  type DatabasePlaceSearchCandidate,
  DatabasePlaceSearchError,
  type DatabasePlaceSearchInput,
  DatabasePlaceSearchInputSchema,
  type DatabasePlaceSearchProvider,
  type DatabasePlaceSearchResult,
  type DatabasePlaceSearchService,
} from './database-place-search.ts';
export {
  type CreateDatabasePlanEngineOptions,
  createDatabasePlanEngine,
  type DatabaseConflictDomain,
  type DatabaseDesiredStateDraft,
  type DatabaseDesiredStateDraftInput,
  DatabaseDesiredStateDraftSchema,
  type DatabaseDraftArtifact,
  type DatabasePlanApprovalCode,
  DatabasePlanApprovalCodeSchema,
  type DatabasePlanArtifact,
  type DatabasePlanConflict,
  DatabasePlanEngine,
  DatabasePlanError,
  type DatabasePlanErrorCode,
  type DatabaseRecordMutation,
  DatabaseRecordMutationSchema,
} from './database-plan.ts';
export {
  type DatabaseProblemCode,
  type DatabaseProblemExtensions,
  DatabaseProblemExtensionsSchema,
  type DatabaseRecovery,
  type DatabaseRecoveryAction,
  DatabaseRecoveryActionSchema,
  DatabaseRecoverySchema,
  databaseProblemExtensions,
} from './database-problem.ts';
export {
  applyDatabaseRecordDiskEvent,
  type CreateDatabaseRecordIndexOptions,
  createDatabaseRecordIndex,
  DATABASE_LEXICAL_MAX_EVIDENCE_PER_HIT,
  DATABASE_LEXICAL_MAX_HITS,
  DATABASE_LEXICAL_MAX_TERMS,
  type DatabaseLexicalEvidence,
  type DatabaseLexicalMatchField,
  type DatabaseLexicalSearchHit,
  type DatabaseLexicalSearchInput,
  DatabaseLexicalSearchLimitError,
  type DatabaseLexicalSearchResult,
  DatabaseRecordIndex,
  type DatabaseRecordIndexConsistencyReport,
  type DatabaseRecordIndexIssue,
  type DatabaseRecordIndexIssueCode,
  type DatabaseRecordIndexListOptions,
  type DatabaseRecordIndexRebuildResult,
  type DatabaseRecordIndexSnapshot,
  type DatabaseRecordIndexStatus,
} from './database-record-index.ts';
export {
  createDatabaseMarkdownTableWriter,
  DatabaseMarkdownTableWriter,
  DatabaseMarkdownTableWriterError,
  type CreateDatabaseMarkdownTableWriterOptions,
  type DatabaseMarkdownTableCellMutationInput,
  type DatabaseMarkdownTableFileDelta,
  type DatabaseMarkdownTableMutationReceipt,
  type DatabaseMarkdownTableMutationResult,
  type DatabaseMarkdownTableRevision,
  type DatabaseMarkdownTableRowCreateInput,
  type DatabaseMarkdownTableRowMutationInput,
  type DatabaseMarkdownTableUndoInput,
  type DatabaseMarkdownTableWriterFs,
  type DatabaseMarkdownTableWriterErrorCode,
} from './database-markdown-table-writer.ts';
export {
  type CreateDatabaseRepairEngineOptions,
  createDatabaseRepairEngine,
  type DatabaseRepairAction,
  type DatabaseRepairApplyInput,
  type DatabaseRepairBlocker,
  type DatabaseRepairCategory,
  DatabaseRepairEngine,
  DatabaseRepairError,
  type DatabaseRepairErrorCode,
  type DatabaseRepairFileAction,
  type DatabaseRepairIndexAction,
  type DatabaseRepairPlan,
  type DatabaseRepairReceipt,
  type DatabaseRepairResult,
  type DatabaseRepairUniqueIdManifestAction,
} from './database-repair.ts';
export {
  DATABASE_SEMANTIC_EMBED_BATCH_SIZE,
  type DatabaseEmbeddingProvider,
  type DatabaseHybridRetrievalHit,
  type DatabaseHybridRetrievalResult,
  DatabaseSemanticIndex,
  type DatabaseSemanticIndexConfiguration,
  type DatabaseSemanticIndexIdentity,
  type DatabaseSemanticIndexState,
  type DatabaseSemanticIndexStatus,
  type DatabaseSemanticPrivacyMode,
  type DatabaseSemanticSearchHit,
  type DatabaseSemanticSearchResult,
  fuseDatabaseRetrieval,
} from './database-semantic-index.ts';
export {
  type AssignDatabaseRecordIdInput,
  type AssignDatabaseRecordIdResult,
  type CreateDatabaseStoreOptions,
  createDatabaseStore,
  DATABASE_MANIFEST_RELATIVE_DIR,
  type DatabaseOnboardingAction,
  type DatabaseOnboardingItem,
  type DatabaseOnboardingPlannedChange,
  type DatabaseOnboardingPreview,
  type DatabaseOnboardingReason,
  type DatabaseOnboardingReasonCode,
  DatabaseStore,
  type DatabaseStoreDiagnostic,
  type DatabaseStoreDiagnosticCode,
  DatabaseStoreError,
  type DatabaseStoreErrorCode,
  type DatabaseStoreFs,
  type DatabaseStoreSnapshot,
  type PreviewDatabaseSourceOnboardingInput,
} from './database-store.ts';
export {
  createDatabaseSummaryStore,
  DatabaseSummaryStore,
  DatabaseSummaryStoreError,
  type DatabaseSummaryStoreErrorCode,
  type PutGeneratedDatabaseSummaryInput,
} from './database-summary-store.ts';
export {
  createDatabaseTaskRollbackJournal,
  DatabaseTaskRollbackError,
  DatabaseTaskRollbackJournal,
  type DatabaseTaskRollbackResult,
} from './database-task-rollback.ts';
export {
  createDatabaseTaskRunner,
  type DatabaseTaskExecutionContext,
  DatabaseTaskExecutionError,
  type DatabaseTaskHandler,
  type DatabaseTaskHandlers,
  DatabaseTaskRunner,
} from './database-task-runner.ts';
export {
  type CreateDatabaseTaskServiceOptions,
  createDatabaseTaskService,
  type DatabaseManifestMigrationPreview,
  type DatabaseManifestMigrationPreviewItem,
  DatabaseTaskService,
  DatabaseTaskServiceError,
  type DatabaseTaskServiceErrorCode,
  type StartDatabaseBulkTaskInput,
  type StartDatabaseImportTaskInput,
  type StartDatabaseMigrationTaskInput,
  type StartDatabaseTaskInput,
} from './database-task-service.ts';
export {
  type CreateDatabaseTaskInput,
  createDatabaseTaskStore,
  type DatabaseTaskCheckpoint,
  type DatabaseTaskInput,
  type DatabaseTaskOperation,
  type DatabaseTaskProblem,
  type DatabaseTaskProgress,
  type DatabaseTaskState,
  DatabaseTaskStore,
  DatabaseTaskStoreError,
  type DatabaseTaskStoreErrorCode,
  type ListDatabaseTasksInput,
  type ListDatabaseTasksResult,
} from './database-task-store.ts';
export {
  type CreateDatabaseTemplateSchedulerOptions,
  createDatabaseTemplateScheduler,
  type DatabaseTemplateRun,
  DatabaseTemplateRunSchema,
  DatabaseTemplateScheduler,
  type ExecuteDatabaseTemplateInput,
  latestDatabaseTemplateOccurrence,
} from './database-template-scheduler.ts';
export {
  type DetectClaudeDesktopOptions,
  detectClaudeDesktopPresence,
} from './detect-claude-desktop.ts';
export {
  clearEmbeddingsKeyFromAllBackends,
  createEmbeddingsSecretStore,
  DEFAULT_EMBEDDINGS_DIMENSIONS,
  describeStoredEmbeddingsKey,
  EMBEDDINGS_API_KEY_ENV,
  type EmbeddingsKeyReader,
  type EmbeddingsKeyStore,
  type EmbeddingsSecretStore,
  FileEmbeddingsBackend,
  makeLazyEmbeddingsKeyStore,
  type ResolvedSemanticConfig,
  readProjectLocalSemanticConfig,
} from './embeddings/index.ts';
export {
  applyExternalChange,
  createExternalChangeHandler,
  FILE_WATCHER_ORIGIN,
} from './external-change.ts';
export {
  createFileLogger,
  flushFileLogger,
  getLogFilePath,
  getLogsDir,
} from './file-logger.ts';
export {
  type AsyncSubscription,
  assertNeverDiskEvent,
  classifyEvents,
  contentHash,
  type DiskEvent,
  evictStaleTrackerEntries,
  type FileIndexEntry,
  isSelfWrite,
  lastKnownHash,
  pathToDocName,
  registerWrite,
  removeLastKnownHash,
  startWatcher,
  updateLastKnownHash,
  type WatcherHandle,
  writeTracker,
} from './file-watcher.ts';
export {
  type FindEnclosingGitRootResult,
  findEnclosingGitRoot,
} from './fs/find-git-root.ts';
export {
  type FindEnclosingProjectRootResult,
  findEnclosingProjectRoot,
  isProjectRoot,
} from './fs/find-project-root.ts';
export {
  classifyFsPath,
  normalizeFsPath,
  tracedAppendFileSync,
  tracedLinkSync,
  tracedMkdir,
  tracedMkdirSync,
  tracedRename,
  tracedRenameSync,
  tracedRmdirSync,
  tracedRmSync,
  tracedUnlink,
  tracedUnlinkSync,
  tracedWriteFile,
  tracedWriteFileSync,
} from './fs-traced.ts';
export {
  assertGitAvailable,
  compareSemver,
  detectGit,
  fallbackPaths,
  type GitDetected,
  GitNotAvailableError,
  GitTooOldError,
  type InstallGuidance,
  type InstallOption,
  MIN_GIT_VERSION,
  parseGitVersion,
} from './git-preflight.ts';
export {
  emitPreflightFailureSpan,
  GIT_PREFLIGHT_FAIL_SPAN_NAME,
} from './git-preflight-telemetry.ts';
export {
  createOsProbe,
  type ExecFileLike,
  INSTALLED_AGENTS_SCHEMES,
  type InstalledAgentScheme,
} from './handoff-api.ts';
export { readBranchFromHead } from './head-watcher.ts';
export {
  createStreamingErrorWriter,
  errorResponse,
  type HttpErrorStatus,
  streamingProblemEvent,
} from './http/error-response.ts';
export {
  type AttachIdleShutdownOptions,
  attachIdleShutdown,
  type IdleShutdownHandle,
} from './idle-shutdown.ts';
export {
  type BuildConfigYmlOptions,
  buildConfigYmlContent,
  CONFIG_FILENAME,
  type InitContentOptions,
  type InitContentResult,
  initContent,
  OK_OKIGNORE_TEMPLATE,
  packageVersionMajorMinor,
  ROOT_GITIGNORE_TEMPLATE,
  writeRootGitignoreForNewRepo,
} from './init-project.ts';
export {
  createLiveDerivedIndexExtension,
  LIVE_DERIVED_INDEX_DEBOUNCE_MS,
  type LiveDerivedIndexOptions,
} from './live-derived-index.ts';
export {
  type AuthEvent,
  type AuthReposResponse,
  type AuthStatusResponse,
  type CloneCompleteEvent,
  type CloneErrorEvent,
  type CloneEvent,
  type CloneProgressEvent,
  type DeviceCompleteEvent,
  type DeviceErrorEvent,
  type DeviceVerificationEvent,
  type RawCloneEvent,
  type RepoEntry,
  type RunAuthQueryOptions,
  type RunCloneController,
  type RunCloneOptions,
  type RunDeviceFlowController,
  type RunDeviceFlowOptions,
  runAuthReposSubprocess,
  runAuthStatusSubprocess,
  runCloneSubprocess,
  runDeviceFlowSubprocess,
  validateCloneInputs,
} from './local-ops/index.ts';
export {
  createTestLogger,
  getLogger,
  installTestLoggers,
  type LoggerFactoryConfig,
  loggerFactory,
  PinoLogger,
  type PinoLoggerConfig,
} from './logger.ts';
export { isAllowedWorkspaceHostHeader, isLoopbackAddress } from './loopback.ts';
export { getMachineId } from './machine-id.ts';
export {
  type RenameRewriteResult,
  rewriteMarkdownLinksForDocumentRename,
  rewriteWikiLinksForDocumentRename,
} from './managed-rename-rewrite.ts';
export {
  type AgentIdentity,
  MCP_CONNECTION_ID_HEADER,
  sanitizeClientName,
} from './mcp/agent-identity.ts';
export {
  getCurrentMcpLogger,
  McpLogger,
  runWithMcpLogger,
} from './mcp/logger.ts';
export { installPrettyZodErrors } from './mcp/pretty-zod-errors.ts';
export {
  buildExecResult,
  type ExecStructuredResult,
} from './mcp/tools/exec.ts';
export {
  DATABASE_SANDBOX_MCP_TOOL_NAMES,
  type McpToolProfile,
  registerAllTools,
} from './mcp/tools/index.ts';
export {
  encodeDocName,
  encodeFolderRoute,
  encodeSkillRoute,
  resolveUiInfo,
} from './mcp/tools/preview-url.ts';
export {
  createMcpHttpHandler,
  type McpHttpHandler,
  type McpHttpHandlerOptions,
} from './mcp-http.ts';
export {
  type MountMcpAndApiHandle,
  type MountMcpAndApiOptions,
  mountMcpAndApi,
  parseKeepaliveConnectionId,
} from './mcp-mount.ts';
export {
  getMetrics,
  handleCollabSocketError,
  incrementCollabSocketFilteredError,
  incrementServerObserverFire,
  type ReconciliationMetrics,
  resetMetrics,
} from './metrics.ts';
export {
  MISSING_OK_CONFIG_MESSAGE,
  MissingOkConfigError,
  type MissingOkConfigKind,
} from './missing-ok-config-error.ts';
// perf-measurement.ts's HTTP route (installPerfMeasurementHttpRoute) is
// DEV-only test instrumentation for the cap-graduation sweep harness, gated
// behind NODE_ENV + OK_PERF_SERVER_MEMORY_ENABLED. It is intentionally NOT
// re-exported here — putting the route in the package's public surface would
// imply consumers may depend on it. The pure captureServerMemorySnapshot
// helper is reused by the production server memory gauge
// (server-memory-telemetry.ts), which imports it directly; the DEV-only gate
// applies to the route, not the snapshot helper.
export {
  createPersistenceExtension,
  type PersistenceHandle,
  type PersistenceOptions,
  safeContentPath,
} from './persistence.ts';
export { loadPrincipal } from './principal.ts';
export { isProcessAlive, isValidLockPid } from './process-alive.ts';
export {
  acquireProcessLock,
  type LockName,
  lockFilePath,
  ProcessLockCollisionError,
  type ProcessLockHandle,
  type ProcessLockMetadata,
  type ReadProcessLockResult,
  readProcessLock,
  readProcessLockDetailed,
  releaseProcessLock,
  updateProcessLockPort,
} from './process-lock.ts';
export {
  discoverLockDirs,
  extractOkBinaryPath,
  type ProcessUsage,
  processCommand,
  processUsage,
} from './process-scan.ts';
export {
  type EnsureProjectGitResult,
  ensureProjectGit,
  ProjectGitInitError,
} from './project-git.ts';
export {
  type BlockConflict,
  CONFLICT_MARKER_RE,
  containsConflictMarkers,
  type ReconcileInput,
  type ReconcileOutcome,
  reconcile,
  splitMarkdownBlocks,
} from './reconciliation.ts';
export { resolvePackageVersion } from './resolve-package-version.ts';
// Seed scaffolder (`ok seed`) — shared module for the CLI Commander wrapper
// and the Electron IPC handler. Deterministic plan/apply split; writes the
// Karpathy three-layer starter + optional log.md + per-folder
// `<folder>/.ok/frontmatter.yml` + starter templates.
export {
  type ApplyError,
  type ApplyResult,
  applySeed,
  buildStarterFolderFrontmatterYaml,
  coercePackId,
  DEFAULT_PACK_ID,
  type FileEntry,
  formatPackRationale,
  isKnownPackId,
  // Back-compat public export; new code should read STARTER_PACKS['knowledge-base'].
  // oxlint-disable-next-line typescript/no-deprecated
  LOG_MD_TEMPLATE,
  listStarterPacks,
  type PackId,
  planSeed,
  resolvePack,
  type ScaffoldPlan,
  type SeedOptions,
  SeedPrerequisiteError,
  SeedRootDirError,
  type SkipEntry,
  STARTER_FOLDER_FRONTMATTER_FILENAME,
  // Back-compat public export; new code should read STARTER_PACKS['knowledge-base'].
  // oxlint-disable-next-line typescript/no-deprecated
  STARTER_FOLDERS,
  STARTER_PACK_IDS,
  STARTER_PACKS,
  // Back-compat public export; new code should read STARTER_PACKS['knowledge-base'].
  // oxlint-disable-next-line typescript/no-deprecated
  STARTER_TEMPLATES,
  type StarterFolder,
  type StarterPack,
  type StarterPackEntryCounts,
  type StarterPackFolderInfo,
  type StarterPackInfo,
} from './seed/index.ts';
export { serializeError } from './serialize-error.ts';
export {
  createServer,
  type ServerInstance,
  type ServerOptions,
} from './server-factory.ts';
export {
  acquireServerLock,
  markServerLockDraining,
  readServerLock,
  releaseServerLock,
  ServerLockCollisionError,
  type ServerLockMetadata,
  updateServerLockPort,
  waitForServerLockDrain,
} from './server-lock.ts';
export {
  createServerObserverExtension,
  type ServerObserverExtensionOptions,
} from './server-observer-extension.ts';
export {
  isPairedWriteOrigin,
  OBSERVER_SYNC_ORIGIN,
  type ObserverDispatchKind,
  type PairedWriteOrigin,
  type SetupServerObserversOpts,
  setupServerObservers,
} from './server-observers.ts';
export {
  buildWipTree,
  type CheckpointGcResult,
  type CheckpointRetentionPolicy,
  commitUpstreamImport,
  commitWip,
  commitWipFromTree,
  DEFAULT_CHECKPOINT_RETENTION,
  FILE_SYSTEM_WRITER,
  GIT_UPSTREAM_WRITER,
  gcCheckpointRefs,
  type InMemoryCheckpointParams,
  initShadowRepo,
  listRescueCheckpoints,
  type SafetyCheckpointParams,
  type SaveVersionResult,
  SERVICE_WRITER,
  type ShadowHandle,
  type ShadowRef,
  safetyCheckpoint,
  saveInMemoryCheckpoint,
  saveVersion,
  shadowGit,
  type TimelineRescueEntry,
  type WriterIdentity,
} from './shadow-repo.ts';
export {
  countShadowObjects,
  countStaleAgentWipRefs,
  countWipRefs,
  hasGcLogLatch,
  type ShadowObjectStats,
} from './shadow-repo-stats.ts';
export {
  createEphemeralProjectDir,
  prepareSingleFileOpen,
  SingleFileNotAFileError,
  SingleFileNotFoundError,
  SingleFileNotMarkdownError,
  type SingleFileOpenPlan,
} from './single-file-open.ts';
export {
  BUNDLE_IDS,
  BUNDLE_SCOPE,
  BUNDLE_SKILL_NAME,
  bundleSkillMdPath,
  USER_GLOBAL_BUNDLE_IDS,
} from './skill-bundles.ts';
export {
  type BuildAndOpenSkillOptions,
  type BuildAndOpenSkillResult,
  type BuildAndOpenSkillStatus,
  buildAndOpenSkill,
  type InstallUserSkillOptions,
  type InstallUserSkillResult,
  installUserSkill,
  type SkillInstallLogger,
  type SpawnLike,
} from './skill-install.ts';
export {
  recordSkillInstallEvent,
  SKILL_INSTALL_EVENTS_FILE_REL,
  type SkillInstallEvent,
  type SkillInstallEventOutcome,
  type SkillInstallEventSurface,
} from './skill-install-events.ts';
export {
  isProjectSkillManaged,
  readSkillManagement,
  type SkillManagement,
  skillManagementPath,
  writeSkillManagement,
} from './skill-management.ts';
export {
  readAllTargets,
  readBundleDecision,
  readServerPackageVersion,
  readSkillInstallStateSnapshot,
  readTargetRecordedAt,
  readTargetVersion,
  resolveBundleEnabled,
  SKILL_STATE_TARGETS,
  type SkillInstallStateSnapshot,
  type SkillStateLogger,
  type SkillStateTarget,
  writeBundleDecision,
  writeTargetVersion,
} from './skill-state.ts';
export {
  CURSOR_BUNDLE_PATHS_BY_PLATFORM,
  type HandleSpawnCursorDeps,
  handleSpawnCursor,
  isPathWithinDir,
  resolveCursorBinaryDefault,
  resolveCursorSpawnInvocation,
  type SpawnCursorOutcome,
} from './spawn-cursor-api.ts';
export { type SpawnDetachedOutcome, spawnDetached } from './spawn-detached.ts';
export {
  assertCompatibleStateManifest,
  detectProjectShape,
  type ProjectShape,
  type ReadStateManifestResult,
  readStateManifest,
  STATE_MANIFEST_FILENAME,
  StateManifestError,
  type StateManifestRecord,
  type StateManifestWriter,
  writeStateManifest,
} from './state-manifest.ts';
export {
  TagIndex,
  type TagIndexOptions,
  type TagSummaryEntry,
} from './tag-index.ts';
export {
  getMeter,
  getTracer,
  initTelemetry,
  setActiveSpanAttributes,
  shutdownTelemetry,
  withSpan,
  withSpanSync,
} from './telemetry.ts';
export {
  logsCurrentPath,
  logsPreviousPath,
  spansCurrentPath,
  spansPreviousPath,
} from './telemetry-file-sink.ts';
export {
  initToleranceTelemetryWriter,
  isToleranceTelemetryEnabled,
  type ToleranceFireLine,
  teardownToleranceTelemetryWriter,
} from './tolerance-telemetry-writer.ts';
export {
  acquireUiLock,
  readUiLock,
  releaseUiLock,
  UiLockCollisionError,
  type UiLockMetadata,
  updateUiLockPort,
} from './ui-lock.ts';
export {
  PROTOCOL_VERSION,
  RUNTIME_VERSION,
  STATE_SCHEMA_VERSION,
} from './version-constants.ts';
