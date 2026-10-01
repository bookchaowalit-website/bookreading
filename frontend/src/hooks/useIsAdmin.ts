import { useEffect, useState } from 'react';
import { authApi, isAdminUser } from '@/lib/api';

/**
 * Reads the signed-in user's role from GET /api/users/me.
 *
 * UI-only gate: the backend enforces the admin role on every moderation
 * route; this just avoids showing controls that would answer 403. Any
 * failure (signed out, network) counts as "not admin".
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    authApi
      .getMe()
      .then((user) => {
        if (!cancelled) setIsAdmin(isAdminUser(user));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isAdmin, loading };
}
