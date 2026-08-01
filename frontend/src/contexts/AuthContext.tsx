import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface UserProfile {
  user_id: string
  firm_id: string
  team_id: string
  user_role: 'owner' | 'admin' | 'partner' | 'manager' | 'senior' | 'junior'
  email: string
  name: string
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  profile: UserProfile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session) _loadProfile(data.session)
      else setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (newSession) _loadProfile(newSession)
      else {
        setProfile(null)
        setLoading(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function _loadProfile(s: Session) {
    // Extract custom claims injected by custom_access_token_hook (Migration 006)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const claims = (s as any).access_token
      ? (JSON.parse(atob((s.access_token.split('.')[1]))) as Record<string, unknown>)
      : {}

    // app_metadata is always in JWT (no hook needed); top-level is legacy hook path
    const meta = (claims.app_metadata ?? {}) as Record<string, unknown>
    const firmId = (meta.firm_id ?? claims.firm_id) as string | undefined
    const teamId = (meta.team_id ?? claims.team_id) as string | undefined
    const userRole = (meta.user_role ?? claims.user_role) as string | undefined

    if (firmId && teamId && userRole) {
      // Hook worked normally — use JWT claims directly
      setProfile({
        user_id: s.user.id,
        firm_id: firmId,
        team_id: teamId,
        user_role: userRole as UserProfile['user_role'],
        email: s.user.email ?? '',
        name: (s.user.user_metadata?.name as string) ?? '',
      })
    } else {
      // Hook failed gracefully — fallback to DB lookup via signature-only endpoint
      try {
        const apiBase = import.meta.env.VITE_API_BASE_URL ?? ''
        const res = await fetch(`${apiBase}/api/v1/users/profile`, {
          headers: { Authorization: `Bearer ${s.access_token}` },
        })
        if (res.ok) {
          const { data } = await res.json()
          setProfile({
            user_id: s.user.id,
            firm_id: data.firm_id ?? '',
            team_id: data.team_id ?? '',
            user_role: (data.role ?? 'junior') as UserProfile['user_role'],
            email: s.user.email ?? '',
            name: data.name ?? (s.user.user_metadata?.name as string) ?? '',
          })
        } else {
          // 404 = new user, no firm yet → register flow
          setProfile({ user_id: s.user.id, firm_id: '', team_id: '', user_role: 'junior', email: s.user.email ?? '', name: '' })
        }
      } catch {
        setProfile({ user_id: s.user.id, firm_id: '', team_id: '', user_role: 'junior', email: s.user.email ?? '', name: '' })
      }
    }
    setLoading(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}

interface ProtectedRouteProps {
  children: ReactNode
  roles?: UserProfile['user_role'][]
}

export function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        Loading...
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  // Session exists but firm registration not yet completed (no firm_id in JWT)
  if (profile && !profile.firm_id) {
    return <Navigate to="/register" replace />
  }

  if (roles && profile && !roles.includes(profile.user_role)) {
    return <Navigate to="/conversation" replace />
  }

  return <>{children}</>
}
