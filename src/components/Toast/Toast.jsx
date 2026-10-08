import { useEffect, useRef } from 'react'
import './Toast.css'

/**
 * Toast — Slide-in notification banner.
 *
 * Props:
 *  @param {boolean}  isVisible  — show/hide the toast
 *  @param {string}   title      — bold first line
 *  @param {string}   message    — smaller second line (optional)
 *  @param {'success'|'error'|'info'} variant — colour scheme (default: 'success')
 *  @param {number}   duration   — ms before auto-hide (default: 3000)
 *  @param {Function} onHide     — called after auto-dismiss; parent resets isVisible
 */
function Toast({
  isVisible,
  title,
  message = '',
  variant = 'success',
  duration = 3000,
  onHide,
}) {
  const timerRef = useRef(null)

  const ICONS = {
    success: '✅',
    error:   '❌',
    info:    'ℹ️',
  }

  useEffect(() => {
    // Clear any existing timer when visibility changes
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (isVisible && onHide) {
      timerRef.current = setTimeout(() => {
        onHide()
      }, duration)
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isVisible, duration, onHide])

  return (
    <div
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className={[
        'toast',
        `toast--${variant}`,
        isVisible ? 'toast--visible' : '',
      ].join(' ')}
    >
      <span className="toast__icon" aria-hidden="true">
        {ICONS[variant] ?? ICONS.success}
      </span>
      <div className="toast__body">
        <span className="toast__title">{title}</span>
        {message && (
          <span className="toast__message">{message}</span>
        )}
      </div>
    </div>
  )
}

export default Toast
