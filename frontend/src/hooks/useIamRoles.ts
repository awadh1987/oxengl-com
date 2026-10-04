import { useEffect, useState } from 'react';
import { erpApi } from '../services/api';
import { EXTERNAL_INVITE_ROLES, IAM_ROLES } from '../constants/iamRoles';

export interface IamRolesState {
  roles: string[];
  externalRoles: string[];
  canAssignPrivileged: boolean;
  /** True when the list came from the backend catalogue (false = static fallback mirror). */
  fromServer: boolean;
  loading: boolean;
}

const FALLBACK: IamRolesState = {
  roles: [...IAM_ROLES],
  externalRoles: [...EXTERNAL_INVITE_ROLES],
  canAssignPrivileged: false,
  fromServer: false,
  loading: true,
};

let inflight: Promise<IamRolesState> | null = null;

// Deduplicates concurrent mounts; not cached across calls so privileges follow the logged-in user.
function loadRoles(): Promise<IamRolesState> {
  if (!inflight) {
    inflight = erpApi
      .getIamRoles()
      .then((res) => {
        const state: IamRolesState = {
          roles: res.roles.map((r) => r.value),
          externalRoles: res.external_roles.map((r) => r.value),
          canAssignPrivileged: !!res.can_assign_privileged,
          fromServer: true,
          loading: false,
        };
        return state;
      })
      .catch(() => ({ ...FALLBACK, loading: false }))
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** Single source for every role dropdown: backend catalogue, with the shared constant as fallback. */
export function useIamRoles(): IamRolesState {
  const [state, setState] = useState<IamRolesState>(FALLBACK);
  useEffect(() => {
    let alive = true;
    loadRoles().then((s) => {
      if (alive) setState(s);
    });
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
