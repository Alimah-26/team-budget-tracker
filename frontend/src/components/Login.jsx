import { useRef, useState } from 'react'
import { GoogleLogin } from '@react-oauth/google'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { loginWithGoogle } from '../api.js'
import './Login.css'

export default function Login({ onLoginSuccess }) {
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const loginPending = useRef(false)

  async function handleSuccess(credentialResponse) {
    if (loginPending.current) return
    setError('')

    const idToken = credentialResponse.credential
    if (!idToken) {
      setError('Google did not return a sign-in credential. Please try again.')
      return
    }

    loginPending.current = true
    setIsLoading(true)

    try {
      // The API helper already unwraps Axios's response.data.
      const response = await loginWithGoogle(idToken)
      if (!response?.access_token || !['admin', 'employee'].includes(response.user?.role)) {
        throw new Error('The server returned an incomplete sign-in response. Please try again.')
      }

      localStorage.setItem('token', response.access_token)
      onLoginSuccess(response.access_token, response.user)
    } catch (err) {
      const detail = err.response?.data?.detail
      const message = typeof detail === 'string'
        ? detail
        : err.response
          ? 'Unable to sign in. Please try again.'
          : err.code === 'ERR_NETWORK'
            ? 'Unable to reach the server. Check your connection and try again.'
            : err.message || 'Unable to sign in. Please try again.'
      setError(message)
    } finally {
      loginPending.current = false
      setIsLoading(false)
    }
  }

  return (
    <section className="login-page" aria-labelledby="login-heading">
      <div className="login-card" aria-busy={isLoading}>
        <div className="login-emblem">
          <ShieldCheck size={32} aria-hidden="true" />
        </div>
        <h1 id="login-heading">Team Budget Tracker</h1>
        <p>Sign in with your company Google account.</p>

        <div className="login-google" inert={isLoading}>
          <GoogleLogin
            onSuccess={handleSuccess}
            onError={() => setError('Google sign-in failed. Please try again.')}
            onScriptLoadError={() => setError('Unable to load Google sign-in. Refresh the page to try again.')}
            theme="outline"
            size="large"
            shape="pill"
          />
        </div>

        {isLoading && <p role="status">Signing you in…</p>}
        {error && (
          <div className="login-error" role="alert">
            <AlertCircle size={18} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}


      </div>
    </section>
  )
}
