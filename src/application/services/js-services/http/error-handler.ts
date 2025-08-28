import { notify } from '@/components/_shared/notify';
import { invalidToken } from '@/application/session/token';

// Error codes from AppFlowy-Cloud-Premium
export enum ErrorCode {
  Ok = 0,
  Unhandled = -1,
  RecordNotFound = -2,
  RecordAlreadyExists = -3,
  RecordDeleted = -4,
  RetryLater = -5,
  InvalidEmail = 1001,
  InvalidPassword = 1002,
  OAuthError = 1003,
  MissingPayload = 1004,
  DBError = 1005,
  OpenError = 1006,
  InvalidUrl = 1007,
  InvalidRequest = 1008,
  InvalidOAuthProvider = 1009,
  NotLoggedIn = 1011,
  NotEnoughPermissions = 1012,
  StorageSpaceNotEnough = 1015,
  PayloadTooLarge = 1016,
  Internal = 1017,
  UuidError = 1018,
  IOError = 1019,
  SqlxError = 1020,
  S3ResponseError = 1021,
  SerdeError = 1022,
  NetworkError = 1023,
  UserUnAuthorized = 1024,
  NoRequiredData = 1025,
  WorkspaceLimitExceeded = 1026,
  WorkspaceMemberLimitExceeded = 1027,
  FileStorageLimitExceeded = 1028,
  OverrideWithIncorrectData = 1029,
  PublishNamespaceNotSet = 1030,
  PublishNamespaceAlreadyTaken = 1031,
  AIServiceUnavailable = 1032,
  AIResponseLimitExceeded = 1033,
  StringLengthLimitReached = 1034,
  SqlxArgEncodingError = 1035,
  InvalidContentType = 1036,
  SingleUploadLimitExceeded = 1037,
  AppleRevokeTokenError = 1038,
  InvalidPublishedOutline = 1039,
  InvalidFolderView = 1040,
  NotInviteeOfWorkspaceInvitation = 1041,
  MissingView = 1042,
  AccessRequestAlreadyExists = 1043,
  CustomNamespaceDisabled = 1044,
  CustomNamespaceDisallowed = 1045,
  TooManyImportTask = 1046,
  CustomNamespaceTooShort = 1047,
  CustomNamespaceTooLong = 1048,
  CustomNamespaceReserved = 1049,
  PublishNameAlreadyExists = 1050,
  PublishNameInvalidCharacter = 1051,
  PublishNameTooLong = 1052,
  CustomNamespaceInvalidCharacter = 1053,
  ServiceTemporaryUnavailable = 1054,
  DecodeUpdateError = 1055,
  ApplyUpdateError = 1056,
  ActionTimeout = 1057,
  AIImageResponseLimitExceeded = 1058,
  MailerError = 1059,
  LicenseError = 1060,
  AIMaxRequired = 1061,
  InvalidPageData = 1062,
  MemberNotFound = 1063,
  InvalidBlock = 1064,
  RequestTimeout = 1065,
  AIResponseError = 1066,
  FeatureNotAvailable = 1067,
  InvalidInvitationCode = 1068,
  InvalidGuest = 1069,
  FreePlanGuestLimitExceeded = 1070,
  PaidPlanGuestLimitExceeded = 1071,
  CommercialError = 1072,
  TooManyExportTask = 1073,
  InvalidSubscriptionPlan = 1076,
  AlreadySubscribed = 1077,
  UserIsNotCustomer = 1078,
  TooManyRequests = 1079,
  JsonWebTokenError = 1081,
  LicenseExpired = 1082,
  LicenseDeleted = 1083,
  LicenseReachLimit = 1084,
  ImportError = 1085,
  ExportError = 1086,
  UploadFileNotFound = 1087,
  UploadFileExpired = 1088,
  UploadFileTooLarge = 1089,
  UpgradeRequired = 1090,
  UnzipError = 1091,
  CannotOpenWorkspace = 1092,
  StreamGroupNotExist = 1093,
  S3ServiceUnavailable = 1094,
  ImportCollabError = 1095,
  RealtimeProtocolError = 1096,
  CollabAwarenessError = 1097,
  RealtimeDecodingError = 1098,
  UnexpectedRealtimeData = 1099,
  ExpectInitSync = 1100,
  CollabError = 1101,
  NotEnoughPermissionToWrite = 1102,
  NotEnoughPermissionToRead = 1103,
  RealtimeUserNotFound = 1104,
  GroupNotFound = 1105,
  CreateGroupWorkspaceIdMismatch = 1106,
  CreateGroupCannotGetCollabData = 1107,
  NoRequiredCollabData = 1108,
  TooManyRealtimeMessages = 1109,
  LockTimeout = 1110,
  CollabStreamError = 1111,
  CannotCreateGroup = 1112,
  BincodeCollabError = 1113,
  CreateSnapshotFailed = 1114,
  GetLatestSnapshotFailed = 1115,
  CollabSchemaError = 1116,
  LeaseError = 1117,
  SendWSMessageFailed = 1118,
  IndexerStreamGroupNotExist = 1119,
  LicenseLimitHit = 1120,
}

export interface AppResponseError {
  code: ErrorCode;
  message: string;
}

// Error categories for better handling
export const isAuthError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.UserUnAuthorized,
    ErrorCode.NotLoggedIn,
    ErrorCode.OAuthError,
    ErrorCode.InvalidPassword,
    ErrorCode.AppleRevokeTokenError,
    ErrorCode.JsonWebTokenError,
  ].includes(code);
};

export const isPermissionError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.NotEnoughPermissions,
    ErrorCode.NotEnoughPermissionToWrite,
    ErrorCode.NotEnoughPermissionToRead,
    ErrorCode.NotInviteeOfWorkspaceInvitation,
    ErrorCode.InvalidGuest,
  ].includes(code);
};

export const isResourceError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.RecordNotFound,
    ErrorCode.RecordDeleted,
    ErrorCode.MissingView,
    ErrorCode.UploadFileNotFound,
    ErrorCode.MemberNotFound,
  ].includes(code);
};

export const isDuplicateError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.RecordAlreadyExists,
    ErrorCode.PublishNameAlreadyExists,
    ErrorCode.PublishNamespaceAlreadyTaken,
    ErrorCode.AccessRequestAlreadyExists,
    ErrorCode.AlreadySubscribed,
  ].includes(code);
};

export const isLimitError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.StorageSpaceNotEnough,
    ErrorCode.PayloadTooLarge,
    ErrorCode.WorkspaceLimitExceeded,
    ErrorCode.WorkspaceMemberLimitExceeded,
    ErrorCode.FileStorageLimitExceeded,
    ErrorCode.StringLengthLimitReached,
    ErrorCode.SingleUploadLimitExceeded,
    ErrorCode.FreePlanGuestLimitExceeded,
    ErrorCode.PaidPlanGuestLimitExceeded,
    ErrorCode.UploadFileTooLarge,
    ErrorCode.TooManyImportTask,
    ErrorCode.TooManyExportTask,
    ErrorCode.AIResponseLimitExceeded,
    ErrorCode.AIImageResponseLimitExceeded,
    ErrorCode.LicenseReachLimit,
    ErrorCode.LicenseLimitHit,
  ].includes(code);
};


export const isValidationError = (code: ErrorCode): boolean => {
  return [
    ErrorCode.InvalidEmail,
    ErrorCode.InvalidPassword,
    ErrorCode.InvalidRequest,
    ErrorCode.InvalidUrl,
    ErrorCode.InvalidContentType,
    ErrorCode.InvalidPageData,
    ErrorCode.InvalidBlock,
    ErrorCode.InvalidFolderView,
    ErrorCode.InvalidPublishedOutline,
    ErrorCode.PublishNameInvalidCharacter,
    ErrorCode.PublishNameTooLong,
    ErrorCode.CustomNamespaceInvalidCharacter,
    ErrorCode.CustomNamespaceTooShort,
    ErrorCode.CustomNamespaceTooLong,
    ErrorCode.InvalidInvitationCode,
    ErrorCode.InvalidSubscriptionPlan,
  ].includes(code);
};

// Get user-friendly error message
export const getUserFriendlyMessage = (error: AppResponseError): string => {
  // Authentication errors
  if (isAuthError(error.code)) {
    switch (error.code) {
      case ErrorCode.UserUnAuthorized:
        return 'Your session has expired. Please sign in again.';
      case ErrorCode.NotLoggedIn:
        return 'Please sign in to continue.';
      case ErrorCode.InvalidPassword:
        return 'Invalid password. Please try again.';
      default:
        return 'Authentication failed. Please sign in again.';
    }
  }

  // Permission errors
  if (isPermissionError(error.code)) {
    switch (error.code) {
      case ErrorCode.NotEnoughPermissions:
        return 'You do not have permission to perform this action.';
      case ErrorCode.NotEnoughPermissionToWrite:
        return 'You have read-only access to this resource.';
      case ErrorCode.NotEnoughPermissionToRead:
        return 'You do not have permission to view this resource.';
      default:
        return 'Access denied. Insufficient permissions.';
    }
  }

  // Resource errors
  if (isResourceError(error.code)) {
    switch (error.code) {
      case ErrorCode.RecordNotFound:
        return 'The requested item could not be found.';
      case ErrorCode.RecordDeleted:
        return 'This item has been deleted.';
      case ErrorCode.MissingView:
        return 'The page or view could not be found.';
      default:
        return 'Resource not available.';
    }
  }

  // Duplicate errors
  if (isDuplicateError(error.code)) {
    switch (error.code) {
      case ErrorCode.RecordAlreadyExists:
        return 'This item already exists.';
      case ErrorCode.PublishNameAlreadyExists:
        return 'This publish name is already taken. Please choose another.';
      case ErrorCode.AlreadySubscribed:
        return 'You are already subscribed to this plan.';
      default:
        return 'This action would create a duplicate.';
    }
  }

  // Limit errors
  if (isLimitError(error.code)) {
    switch (error.code) {
      case ErrorCode.StorageSpaceNotEnough:
        return 'Storage space limit reached. Please upgrade your plan.';
      case ErrorCode.PayloadTooLarge:
        return 'The file or content is too large.';
      case ErrorCode.UploadFileTooLarge:
        return 'File size exceeds the maximum allowed. Please upgrade for larger uploads.';
      case ErrorCode.WorkspaceLimitExceeded:
        return 'Workspace limit reached. Please upgrade your plan.';
      case ErrorCode.FreePlanGuestLimitExceeded:
        return 'Guest limit reached for free plan. Please upgrade to add more guests.';
      default:
        return 'Limit exceeded. Please upgrade your plan or reduce usage.';
    }
  }

  // Validation errors
  if (isValidationError(error.code)) {
    switch (error.code) {
      case ErrorCode.InvalidEmail:
        return 'Please enter a valid email address.';
      case ErrorCode.InvalidRequest:
        return 'Invalid request. Please check your input.';
      case ErrorCode.InvalidInvitationCode:
        return 'Invalid or expired invitation code.';
      case ErrorCode.PublishNameTooLong:
        return 'The publish name is too long. Please use a shorter name.';
      default:
        return 'Invalid input. Please check and try again.';
    }
  }

  // Service/Network errors
  switch (error.code) {
    case ErrorCode.ServiceTemporaryUnavailable:
      return 'Service temporarily unavailable. Please try again later.';
    case ErrorCode.TooManyRequests:
      return 'Too many requests. Please wait a moment and try again.';
    case ErrorCode.RequestTimeout:
      return 'Request timed out. Please try again.';
    case ErrorCode.NetworkError:
      return 'Network error. Please check your connection.';
  }

  // Special cases
  switch (error.code) {
    case ErrorCode.UpgradeRequired:
      return 'Please upgrade to the latest version to continue.';
    case ErrorCode.LicenseExpired:
      return 'Your license has expired. Please renew to continue.';
    case ErrorCode.FeatureNotAvailable:
      return 'This feature is not available in your current plan.';
    case ErrorCode.AIServiceUnavailable:
      return 'AI service is currently unavailable. Please try again later.';
    case ErrorCode.ImportError:
      return 'Import failed. Please check your file and try again.';
    case ErrorCode.ExportError:
      return 'Export failed. Please try again.';
    default:
      // Fall back to server message if available, otherwise generic message
      return error.message || 'An unexpected error occurred. Please try again.';
  }
};

// Main error handler
export class ApiErrorHandler {
  private static instance: ApiErrorHandler;

  static getInstance(): ApiErrorHandler {
    if (!ApiErrorHandler.instance) {
      ApiErrorHandler.instance = new ApiErrorHandler();
    }

    return ApiErrorHandler.instance;
  }

  /**
   * Handle API error response
   */
  async handleError(
    error: AppResponseError,
    options: {
      showNotification?: boolean;
      throwError?: boolean;
      customMessage?: string;
      onAuthError?: () => void;
      onPermissionError?: () => void;
    } = {}
  ): Promise<void> {
    const {
      showNotification = true,
      throwError = true,
      customMessage,
      onAuthError,
      onPermissionError,
    } = options;

    // Log error for debugging
    console.error(`API Error [${error.code}]: ${error.message}`);

    // Handle authentication errors
    if (isAuthError(error.code)) {
      invalidToken();
      if (onAuthError) {
        onAuthError();
      } else {
        // Default: redirect to login
        window.location.href = '/login';
      }

      return;
    }

    // Handle permission errors
    if (isPermissionError(error.code)) {
      if (onPermissionError) {
        onPermissionError();
      }

      if (showNotification) {
        notify.error(customMessage || getUserFriendlyMessage(error));
      }

      if (throwError) {
        throw error;
      }

      return;
    }

    // Show user-friendly notification
    if (showNotification) {
      const message = customMessage || getUserFriendlyMessage(error);
      
      if (isLimitError(error.code)) {
        // For limit errors, show warning with upgrade prompt
        notify.warning(message);
      } else if (isValidationError(error.code)) {
        // For validation errors, show as warning
        notify.warning(message);
      } else {
        // For other errors, show as error
        notify.error(message);
      }
    }

    // Throw error if requested
    if (throwError) {
      throw error;
    }
  }

  /**
   * Wrap API call with error handling
   */
  async wrapApiCall<T>(
    apiCall: () => Promise<T>,
    options?: Parameters<typeof this.handleError>[1]
  ): Promise<T> {
    try {
      return await apiCall();
    } catch (error: unknown) {
      // Check if it's an API response error
      if ((error as AppResponseError)?.code !== undefined) {
        await this.handleError(error as AppResponseError, options);
      }

      throw error;
    }
  }

}

// Export singleton instance
export const apiErrorHandler = ApiErrorHandler.getInstance();

// Helper function for easy use
export const handleApiError = (
  error: AppResponseError,
  options?: Parameters<ApiErrorHandler['handleError']>[1]
) => {
  return apiErrorHandler.handleError(error, options);
};