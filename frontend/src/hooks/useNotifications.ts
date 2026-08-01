import { useEffect, useState, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

export interface AppNotification {
  id: string
  message: string
  action_url: string
  case_id: string
  task_id: string
  created_at: string
}

const AUTO_DISMISS_MS = 8_000

export function useNotifications() {
  const { profile } = useAuth()
  const queryClient = useQueryClient()
  const [queue, setQueue] = useState<AppNotification[]>([])

  const dismiss = useCallback((id: string) => {
    setQueue(prev => prev.filter(n => n.id !== id))
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .then(() => {})
  }, [])

  useEffect(() => {
    const userId = profile?.user_id
    if (!userId) return

    // Silently mark all old unread notifications as read on mount.
    // Historical workflow events don't need to re-surface as toasts — only
    // real-time INSERTs (below) trigger toasts for genuinely new events.
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null)
      .gte('created_at', since)
      .then(() => {})

    // Subscribe to new notifications via Realtime
    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const n = payload.new as AppNotification
          setQueue(prev => prev.some(q => q.id === n.id) ? prev : [...prev, n])
          // Auto-dismiss: remove from toast queue AND mark as read in DB so it
          // never re-surfaces on next mount.
          setTimeout(() => {
            setQueue(prev => prev.filter(q => q.id !== n.id))
            supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id).then(() => {})
          }, AUTO_DISMISS_MS)
          // Immediately refresh conversation task pills when a new notification arrives
          queryClient.invalidateQueries({ queryKey: ['conversation-opening'] })
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [profile?.user_id])

  return { queue, dismiss }
}
