/** Shared API / domain types for WorkNest ERP Phase 1 */

export type ApiSuccessResponse<T> = {
  success: true;
  data: T;
};

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export type ApiErrorResponse = {
  success: false;
  error: ApiErrorBody;
};

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

export type EmploymentStatus = 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED';

export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'LOGIN'
  | 'LOGOUT'
  | 'ROLE_ASSIGNED'
  | 'ROLE_REMOVED'
  | 'PERMISSION_CHANGED';

export type PermissionKey = string;

export interface AuthUser {
  id: string;
  email: string;
  isActive: boolean;
  permissions: PermissionKey[];
  roles: Array<{ id: string; name: string }>;
  employee?: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type TypingTestMode = 'TIME' | 'WORDS';

export type TypingTextCategory = 'general' | 'business' | 'erp' | 'office' | 'programming';

export interface TypingTestResultRecord {
  id: string;
  userId: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  correctCharacters: number;
  incorrectCharacters: number;
  totalCharacters: number;
  wordsCompleted: number;
  durationSeconds: number;
  mode: TypingTestMode;
  modeValue: number;
  textCategory: string;
  createdAt: string;
}

export interface TypingLeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string;
  wpm: number;
  accuracy: number;
  mode: TypingTestMode;
  modeValue: number;
  textCategory: string;
  createdAt: string;
}

export interface TypingLeaderboardResponse {
  items: TypingLeaderboardEntry[];
  myRank: number | null;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface TypingMyStats {
  bestWpm: number;
  averageWpm: number;
  bestAccuracy: number;
  averageAccuracy: number;
  totalTests: number;
  totalTypingTimeSeconds: number;
  recentTests: TypingTestResultRecord[];
  wpmHistory: Array<{ date: string; wpm: number }>;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
