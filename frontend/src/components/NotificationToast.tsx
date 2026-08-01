import { type ReactElement } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppNotification } from '../hooks/useNotifications'

interface Props {
  notifications: AppNotification[]
  onDismiss: (id: string) => void
}

export default function NotificationToast({ notifications, onDismiss }: Props): ReactElement | null {
  const navigate = useNavigate()

  if (notifications.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex w-80 items-start gap-3 rounded-lg border border-blue-200 bg-white p-4 shadow-lg"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 leading-snug">{n.message}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-1 ml-1">
            {n.action_url !== '/conversation' && (
              <button
                onClick={() => { navigate(n.action_url); onDismiss(n.id) }}
                className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
              >
                Open
              </button>
            )}
            <button
              onClick={() => onDismiss(n.id)}
              className="rounded p-1 text-lg leading-none text-gray-400 hover:text-gray-600"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
