import { useRef, useState, useEffect } from 'react'
import type { ReactElement } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../contexts/AuthContext'
import { APP_NAME } from '../lib/config'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpeningData {
  role: string
  pending_tasks?: TaskSummary[]
  my_tasks?: TaskSummary[]
  certify_queue?: TaskSummary[]
  urgent_count?: number
  open_cases?: CaseSummary[]
  open_cases_count?: number
  juniors?: { id: string; name: string }[]
}

interface TaskSummary {
  id: string
  task_type: string
  status: string
  sla_due_at?: string | null
  cases?: {
    period: string
    case_type: string
    clients?: { business_name: string }
    files?: { account?: string }[]
  }
}

interface CaseSummary {
  id: string
  status: string
  period: string
  case_type: string
  clients?: { business_name: string }
}

type MessageRole = 'hermes' | 'user'

interface Message {
  id: string
  role: MessageRole
  text: string
  taskPills?: TaskSummary[]
  links?: { label: string; url: string }[]
  slaSummary?: { overdue: number; approach: number }
}

// ── Quick actions ──────────────────────────────────────────────────────────────
// ORCHESTRATOR INTEGRATION POINT:
// Each action's handler currently does simple navigation / local state.
// When Hermes Orchestrator is integrated, replace each handler body with:
//   POST /api/v1/conversation/messages { intent: '<action_key>', content: '<label>' }
// The Orchestrator will query the DB, compose a response with action links,
// and stream it back as a Hermes bubble. All routing logic moves to the backend.

interface QuickAction {
  key: string
  label: string
  icon: ReactElement
}

const IconExtract = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
  </svg>
)
const IconUserPlus = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" />
  </svg>
)
const IconDocument = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
)
const IconCheckCircle = () => (
  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
)

function getQuickActions(role: string): QuickAction[] {
  const roleAction: Record<string, QuickAction> = {
    junior:  { key: 'extract',       label: 'Batch Extraction', icon: <IconExtract /> },
    senior:  { key: 'review_queue',  label: 'Review Queue',  icon: <IconCheckCircle /> },
    manager: { key: 'extract',       label: 'Batch Extraction', icon: <IconExtract /> },
    partner: { key: 'certify_queue', label: 'Certify Queue', icon: <IconCheckCircle /> },
    admin:   { key: 'overview',      label: 'Overview',      icon: <IconDocument /> },
  }
  return [
    roleAction[role] ?? roleAction['junior'],
    { key: 'new_client', label: 'New Client', icon: <IconUserPlus /> },
    { key: 'workpaper', label: 'Workpaper', icon: <IconDocument /> },
  ]
}

// ── Task pill → operation page mapping ────────────────────────────────────────

function taskRoute(task: TaskSummary): string {
  switch (task.task_type) {
    case 'validate_extraction':
    case 'validate_gst':
      return `/validate/${task.id}`
    case 'senior_review':
      return `/review/${task.id}`
    case 'senior_bas_review':
      return `/senior-bas-draft/${task.id}`
    case 'bas_draft':
    case 'manager_review':
    case 'manager_approve':
      return `/bas-draft/${task.id}`
    case 'client_confirm':
      return `/client-confirm/${task.id}`
    case 'certify':
      return `/certify/${task.id}`
    default:
      return '#'
  }
}

function taskLabel(type: string): string {
  const labels: Record<string, string> = {
    validate_extraction: 'Validate extraction',
    validate_gst:        'GST prep validate',
    senior_review:       'GST Prep Review',
    senior_bas_review:   'BAS draft review',
    bas_draft:           'BAS draft prep',
    manager_review:      'Manager review',
    manager_approve:     'Manager approve',
    client_confirm:      'Client confirmation',
    certify:             'Partner certify',
  }
  return labels[type] ?? type
}

// ── Opening message builder ────────────────────────────────────────────────────

function buildOpeningMessage(data: OpeningData, name: string): Message {
  const greeting = `Good ${timeOfDay()}, ${name || 'there'}.`
  const allTasks = [
    ...(data.pending_tasks ?? []),
    ...(data.my_tasks ?? []),
    ...(data.certify_queue ?? []),
  ].filter((t) => t.status === 'waiting_human')

  let text = greeting + '\n\n'
  const isFirstTime = allTasks.length === 0 && (data.open_cases_count ?? 0) === 0
  const role = data.role ?? ''

  if (isFirstTime) {
    if (role === 'junior') {
      text += `Welcome to ${APP_NAME}! Here's how to get started:\n\n`
      text += `🏢 Go to Clients to add your first client\n`
      text += `📁 Open a new folder for that client\n`
      text += `📤 Upload bank statement PDFs into the folder\n`
      text += `⚡ For multiple accounts, use the Batch Extraction button below\n`
      text += `✅ Once extraction completes, your Validate task will appear here`
    } else if (role === 'senior') {
      text += `Welcome to ${APP_NAME}! Here's what to expect as a Senior:\n\n`
      text += `📋 GST prep review tasks will appear here once a Junior submits their validated workpaper\n`
      text += `🔍 You'll review each transaction's GST coding line by line\n`
      text += `✅ Approve to advance to BAS draft, or return for revision\n`
      text += `👥 Check Clients to see clients assigned to your team`
    } else if (role === 'manager') {
      text += `Welcome to ${APP_NAME}! Here's how to get started:\n\n`
      text += `🏢 Go to Clients to add your first client\n`
      text += `📁 Open a new folder for that client\n`
      text += `📤 Upload the client's bank statement PDFs\n`
      text += `🔍 Validate the extracted transactions\n`
      text += `✅ Your GST review and BAS approval tasks will appear here as the workflow progresses`
    } else if (role === 'partner') {
      text += `Welcome to ${APP_NAME}! Here's your role as Partner:\n\n`
      text += `👥 Go to Team Settings to invite your team and configure the approval chain\n`
      text += `🏢 Register your clients under Clients — ABN, entity type, and BAS cycle\n`
      text += `🔄 Workpapers flow through your team and land here for final sign-off\n`
      text += `✅ You certify each BAS workpaper before it is lodged`
    } else if (role === 'admin') {
      text += `Welcome to ${APP_NAME}! Here's how to set up your firm:\n\n`
      text += `👥 Go to Team Settings to create teams and invite staff\n`
      text += `⚙️ Configure each team's approval chain\n`
      text += `🏢 Register your clients under Clients — ABN, entity type, and BAS cycle\n`
      text += `📊 Monitor firm-wide progress from Dashboard`
    } else {
      text += `Welcome to ${APP_NAME}! No tasks pending.`
    }
  } else if (allTasks.length === 0 && role === 'junior' && (data.open_cases_count ?? 0) > 0) {
    text += `Your submission is under review — no tasks pending on your end.`
  } else if (allTasks.length === 0) {
    text += "You're all caught up — no tasks pending."
  } else {
    const urgent = data.urgent_count ?? 0
    text += `You have ${allTasks.length} task${allTasks.length > 1 ? 's' : ''} pending`
    if (urgent > 0) text += ` — ${urgent} due today`
    text += '.'
  }

  if (!isFirstTime && role !== 'junior' && data.open_cases_count != null && data.open_cases_count > 0) {
    text += `\n\nTeam has ${data.open_cases_count} open folder${data.open_cases_count > 1 ? 's' : ''}.`
  }

  const now = Date.now()
  const h48 = now + 48 * 60 * 60 * 1000
  const slaTasks = allTasks.filter(t => t.sla_due_at)
  const slaOverdue  = slaTasks.filter(t => new Date(t.sla_due_at!).getTime() < now).length
  const slaApproach = slaTasks.filter(t => { const d = new Date(t.sla_due_at!).getTime(); return d >= now && d <= h48 }).length

  return {
    id: 'opening',
    role: 'hermes',
    text,
    taskPills: allTasks.slice(0, 6),
    slaSummary: (slaOverdue > 0 || slaApproach > 0) ? { overdue: slaOverdue, approach: slaApproach } : undefined,
  }
}

function timeOfDay(): string {
  const h = new Date().getHours()
  if (h < 12) return 'morning'
  if (h < 17) return 'afternoon'
  return 'evening'
}

// ── Components ─────────────────────────────────────────────────────────────────

function HermesBubble({ message }: { message: Message }) {
  return (
    <div className="flex gap-3">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white">
        S
      </div>
      <div className="max-w-xl space-y-3">
        <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
          <p className="whitespace-pre-wrap text-sm text-gray-800">{message.text}</p>
          {message.slaSummary && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {message.slaSummary.overdue > 0 && (
                <span className="flex items-center gap-1 font-semibold text-red-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                  SLA overdue {message.slaSummary.overdue}
                </span>
              )}
              {message.slaSummary.approach > 0 && (
                <span className="flex items-center gap-1 font-semibold text-amber-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  Due within 48h {message.slaSummary.approach}
                </span>
              )}
            </div>
          )}
        </div>
        {message.taskPills && message.taskPills.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.taskPills.map((task) => (
              <Link
                key={task.id}
                to={taskRoute(task)}
                className="inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                {task.cases?.clients?.business_name
                  ? (() => {
                      const accounts = [...new Set<string>(
                        (task.cases.files ?? [])
                          .map((f: { account?: string }) => f.account)
                          .filter(Boolean) as string[]
                      )]
                      const acctSuffix = accounts.length ? ` · ${accounts.join('+')}` : ''
                      return `${task.cases.clients.business_name} · ${taskLabel(task.task_type)} · ${task.cases.period}${acctSuffix}`
                    })()
                  : taskLabel(task.task_type)}
              </Link>
            ))}
          </div>
        )}
        {message.links && message.links.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.links.map((link) => (
              <Link
                key={link.url}
                to={link.url}
                className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100"
              >
                {link.label} →
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-xl rounded-2xl rounded-tr-sm bg-gray-900 px-4 py-3">
        <p className="text-sm text-white">{message.text}</p>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ConversationPage() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [messages, setMessages] = useState<Message[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)

  // Fetch role-aware opening context
  const { data: openingData, isLoading, isError } = useQuery({
    queryKey: ['conversation-opening'],
    queryFn: async () => {
      const res = await api.get<{ data: OpeningData }>('/api/v1/conversation/opening')
      return res.data.data
    },
    enabled: !!profile,
    refetchInterval: 10_000,
  })

  useEffect(() => {
    if (!openingData) return
    const newOpening = buildOpeningMessage(openingData, profile?.name ?? '')
    setMessages(prev =>
      prev.some(m => m.id === 'opening')
        ? prev.map(m => m.id === 'opening' ? newOpening : m)
        : [newOpening]
    )
  }, [openingData, profile?.name])

  // ORCHESTRATOR INTEGRATION POINT: replace body with POST /api/v1/conversation/messages
  function handleQuickAction(action: QuickAction) {
    switch (action.key) {
      case 'extract':
        navigate('/upload')
        break
      case 'new_client':
        navigate('/clients/new')
        break
      case 'workpaper':
      case 'review_queue':
      case 'approve_queue':
      case 'certify_queue':
        navigate('/clients')
        break
      case 'overview':
        navigate('/dashboard')
        break
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Topbar */}
      <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white">
          S
        </div>
        <div>
          <p className="text-sm font-semibold text-gray-900">{APP_NAME}</p>
          <p className="flex items-center gap-1 text-xs text-gray-500">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
            Online
          </p>
        </div>

        <div className="ml-auto" />
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {isLoading && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-400">
              S
            </div>
            <div className="h-16 w-64 animate-pulse rounded-2xl rounded-tl-sm bg-gray-100" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-red-500">Failed to load your tasks. Please refresh.</p>
        )}
        <div className="space-y-4">
          {messages.map((msg) =>
            msg.role === 'hermes' ? (
              <HermesBubble key={msg.id} message={msg} />
            ) : (
              <UserBubble key={msg.id} message={msg} />
            ),
          )}
        </div>
        <div ref={bottomRef} />
      </div>

      {/* Input area — conversational Orchestrator coming soon */}
      <div className="flex-shrink-0 bg-white px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5 cursor-not-allowed">
            <textarea
              disabled
              placeholder="Conversational assistant — coming soon"
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-gray-400 placeholder-gray-400 focus:outline-none leading-6 py-0.5 cursor-not-allowed"
            />
          </div>
          {/* Quick action buttons */}
          <div className="mt-3 flex justify-center gap-2">
            {getQuickActions(profile?.user_role ?? 'junior').map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => handleQuickAction(action)}
                className="flex w-44 whitespace-nowrap items-center justify-center gap-2 rounded-full border border-gray-300 bg-white py-2 text-sm font-semibold text-gray-700 hover:border-gray-400 hover:bg-gray-50 transition-colors"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-center text-xs text-gray-400">{APP_NAME} AI can make mistakes. Always verify important information.</p>
        </div>
      </div>

    </div>
  )
}
