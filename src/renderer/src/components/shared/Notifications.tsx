/**
 * Notifications.tsx — Toast notification system
 *
 * Shows temporary pop-up messages at the bottom-right of the screen.
 *
 * HOW IT WORKS:
 * 1. Any component calls `notify('success', 'Imported 5 images')`
 * 2. This adds a notification to the store with a unique ID
 * 3. This component renders all active notifications
 * 4. After 3.5 seconds, each auto-dismisses
 * 5. User can also click ✕ to dismiss early
 *
 * NOTIFICATION TYPES:
 * - success → green (operation completed)
 * - error   → red (something went wrong)
 * - info    → blue (neutral information)
 *
 * ANIMATION:
 * CSS transitions handle slide-in from right side.
 * Each toast has a progress bar that drains over 3.5s.
 */

import React, { useEffect } from 'react'
import { useAppStore } from '../../store/useAppStore'
import type { NotificationState } from '../../types'

const DURATION_MS = 3500

export function Notifications(): React.JSX.Element {
  const { notifications, dismissNotification } = useAppStore()

  return (
    <div className="notifications-container">
      {notifications.map(notification => (
        <Toast
          key={notification.id}
          notification={notification}
          onDismiss={dismissNotification}
        />
      ))}
    </div>
  )
}

// ─── Individual Toast ─────────────────────────────────────────────────────────

interface ToastProps {
  notification: NotificationState
  onDismiss: (id: string) => void
}

function Toast({ notification, onDismiss }: ToastProps): React.JSX.Element {
  const { id, type, message } = notification

  // Auto-dismiss after DURATION_MS
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(id), DURATION_MS)
    return () => clearTimeout(timer)
  }, [id, onDismiss])

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'

  return (
    <div
      className={`toast toast-${type}`}
      role="alert"
    >
      {/* Icon */}
      <div className={`toast-icon toast-icon-${type}`}>
        {icon}
      </div>

      {/* Message */}
      <div className="toast-message">{message}</div>

      {/* Close button */}
      <button
        className="toast-close"
        onClick={() => onDismiss(id)}
        title="Dismiss"
      >
        ✕
      </button>

      {/* Progress bar — drains over DURATION_MS */}
      <div
        className={`toast-progress toast-progress-${type}`}
        style={{ animationDuration: `${DURATION_MS}ms` }}
      />
    </div>
  )
}
