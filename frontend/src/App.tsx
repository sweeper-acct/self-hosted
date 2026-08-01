import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, ProtectedRoute } from './contexts/AuthContext'
import AppShell from './components/AppShell'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ConversationPage from './pages/ConversationPage'
import NewCasePage from './pages/NewCasePage'
import ValidatePage from './pages/ValidatePage'
import SeniorReviewPage from './pages/SeniorReviewPage'
import ManagerReviewPage from './pages/ManagerReviewPage'
import SeniorBasDraftPage from './pages/SeniorBasDraftPage'
import ClientConfirmPage from './pages/ClientConfirmPage'
import CertifyPage from './pages/CertifyPage'
import ClientListPage from './pages/ClientListPage'
import ClientNewPage from './pages/ClientNewPage'
import BatchUploadPage from './pages/BatchUploadPage'
import ClientDetailPage from './pages/ClientDetailPage'
import CaseDetailPage from './pages/CaseDetailPage'
import CaseLogPage from './pages/CaseLogPage'
import DashboardPage from './pages/DashboardPage'
import TeamSettingsPage from './pages/TeamSettingsPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import AIPolicyPage from './pages/AIPolicyPage'
import ClientQueryPage from './pages/ClientQueryPage'
import ClientConfirmReceivePage from './pages/ClientConfirmReceivePage'
import EnterpriseDashboardPage from './pages/EnterpriseDashboardPage'
import ModulesSettingsPage from './pages/ModulesSettingsPage'
import AISettingsPage from './pages/AISettingsPage'
import BillingPage from './pages/BillingPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/ai-policy" element={<AIPolicyPage />} />
            <Route path="/q/:token" element={<ClientQueryPage />} />
            <Route path="/c/:token" element={<ClientConfirmReceivePage />} />
            <Route path="/enterprise/dashboard" element={<EnterpriseDashboardPage />} />

            {/* All authenticated routes rendered inside AppShell */}
            <Route
              element={
                <ProtectedRoute>
                  <AppShell />
                </ProtectedRoute>
              }
            >
              {/* Default landing after login */}
              <Route index element={<Navigate to="/conversation" replace />} />
              <Route path="/conversation" element={<ConversationPage />} />

              {/* Operation pages — entered via links in Hermes conversation */}
              <Route
                path="/validate/:taskId"
                element={<ProtectedRoute roles={['owner', 'junior', 'senior', 'manager', 'partner', 'admin']}><ValidatePage /></ProtectedRoute>}
              />
              <Route
                path="/review/:taskId"
                element={<ProtectedRoute roles={['owner', 'senior', 'manager', 'partner', 'admin']}><SeniorReviewPage /></ProtectedRoute>}
              />
              <Route
                path="/senior-bas-draft/:taskId"
                element={<ProtectedRoute roles={['owner', 'senior', 'manager', 'partner', 'admin']}><SeniorBasDraftPage /></ProtectedRoute>}
              />
              <Route
                path="/bas-draft/:taskId"
                element={<ProtectedRoute roles={['owner', 'manager', 'partner', 'admin']}><ManagerReviewPage /></ProtectedRoute>}
              />
              <Route
                path="/client-confirm/:taskId"
                element={<ProtectedRoute roles={['owner', 'partner']}><ClientConfirmPage /></ProtectedRoute>}
              />
              <Route
                path="/certify/:taskId"
                element={<ProtectedRoute roles={['owner', 'partner']}><CertifyPage /></ProtectedRoute>}
              />

              <Route path="/upload" element={<BatchUploadPage />} />
              <Route path="/clients" element={<ClientListPage />} />
              <Route path="/clients/new" element={<ClientNewPage />} />
              <Route path="/clients/:clientId" element={<ClientDetailPage />} />
              <Route path="/clients/:clientId/cases/:caseId" element={<CaseDetailPage />} />
              <Route path="/onboarding/new-client" element={<NewCasePage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route
                path="/case-log"
                element={<ProtectedRoute roles={['owner', 'senior', 'manager', 'partner', 'admin']}><CaseLogPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/team"
                element={<ProtectedRoute roles={['owner', 'admin', 'partner']}><TeamSettingsPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/modules"
                element={<ProtectedRoute roles={['owner', 'admin', 'partner']}><ModulesSettingsPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/ai"
                element={<ProtectedRoute roles={['owner']}><AISettingsPage /></ProtectedRoute>}
              />
              <Route
                path="/settings/billing"
                element={<ProtectedRoute roles={['owner', 'admin']}><BillingPage /></ProtectedRoute>}
              />
            </Route>

            <Route path="*" element={<Navigate to="/conversation" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
