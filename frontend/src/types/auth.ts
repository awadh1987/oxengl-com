/**
 * Authentication & RBAC Type Definitions
 * Filename: frontend/src/types/auth.ts
 */

import { UserRole, User, Company } from '../types';

export type Role = 'SUPER_ADMIN' | 'OWNER' | 'ADMIN' | 'COO' | 'ACCOUNTANT' | 'DATA_ENTRY' | 'READ_ONLY' | 'GUEST';

export type { UserRole, User, Company };

export interface AuthSession {
  user: User;
  token?: string;
  role: UserRole;
  tenantId?: string;
}
