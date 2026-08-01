import axios from 'axios'
import { API_BASE_URL } from './config'
import { supabase } from './supabase'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Attach current Supabase JWT to every request
api.interceptors.request.use(async (config) => {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response interceptors
api.interceptors.response.use(
  (response) => response,
  async (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status
      const detail = error.response?.data?.detail
      const errCode = error.response?.data?.error?.code as string | undefined

      // 401 with expired/invalid token → sign out
      if (status === 401 && (errCode === 'token_expired' || errCode === 'invalid_token')) {
        await supabase.auth.signOut()
      }

      // 402 subscription_cancelled → redirect to billing page
      if (status === 402 && detail?.code === 'subscription_cancelled') {
        window.location.href = '/settings/billing'
      }
    }
    return Promise.reject(error)
  },
)
