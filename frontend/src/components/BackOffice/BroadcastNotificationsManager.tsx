/**
 * Back-office tab — broadcast a single Web Push notification to every
 * subscribed device.
 *
 * Auth follows the same pattern as `ReferralsManager`: the admin pastes
 * their API key once (persisted in `localStorage` under `bo_api_key`),
 * the UI sends it as `Authorization: <key>`, and the endpoint verifies
 * via `isApiKeyValid` with the `write` permission.
 *
 * UX invariants:
 *   - Title + body are required. URL is optional (defaults to /m).
 *   - A live preview shows the exact notification the user will see,
 *     so admins can catch typos before sending to thousands of devices.
 *   - Send is gated behind an explicit "Confirm" step — no way to
 *     accidentally blast a half-typed message to everyone.
 *   - After a send, the form clears and the recent-broadcasts list
 *     refreshes so the new entry shows at the top.
 */

import { useEffect, useState } from "react"
import { Button } from "../Button/Button"
import Text from "@/components/Text"

type Broadcast = {
  id: string
  title: string
  body: string
  url: string | null
  sent_at: string
  sent_by: string | null
  recipient_count: number
  success_count: number
  failure_count: number
  removed_count: number
}

type HistoryResponse = {
  subscriber_count: number
  broadcasts: Broadcast[]
}

type SendResponse = {
  success: true
  broadcast_id: string
  recipient_count: number
  success_count: number
  failure_count: number
  removed_count: number
} | {
  error: string
}

const BroadcastNotificationsManager = () => {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("bo_api_key") || "")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [url, setUrl] = useState("/mini-app")

  const [subscriberCount, setSubscriberCount] = useState<number | null>(null)
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<string | null>(null)

  const fetchHistory = async (keyOverride?: string) => {
    const key = keyOverride ?? apiKey
    if (!key) {
      setError("Enter your API key")
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/push-broadcast?limit=25", {
        headers: { Authorization: key },
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error || `HTTP ${res.status}`)
      }
      const data = (await res.json()) as HistoryResponse
      setSubscriberCount(data.subscriber_count)
      setBroadcasts(data.broadcasts)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (apiKey) {
      localStorage.setItem("bo_api_key", apiKey)
      fetchHistory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSend = title.trim().length > 0 && body.trim().length > 0 && !isSending

  const handleSend = async () => {
    if (!canSend || !apiKey) return
    setIsSending(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch("/api/admin/push-broadcast", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || null,
        }),
      })
      const data = (await res.json()) as SendResponse
      if (!res.ok || "error" in data) {
        throw new Error("error" in data ? data.error : `HTTP ${res.status}`)
      }
      setLastResult(
        `Sent: ${data.success_count}/${data.recipient_count} delivered, ${data.failure_count} failed, ${data.removed_count} dead subs pruned.`,
      )
      setTitle("")
      setBody("")
      setUrl("/mini-app")
      setConfirmOpen(false)
      await fetchHistory()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-6 px-4">
      <header className="flex items-center justify-between">
        <div>
          <Text as="h2" variant="title-24">Broadcast notifications</Text>
          <Text variant="body-14" className="text-neutral-500">
            Send a Web Push notification to every subscribed device.
          </Text>
        </div>
        {subscriberCount !== null && (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2 text-sm">
            <span className="text-neutral-500">Subscribers:</span>{" "}
            <span className="font-mono font-bold">{subscriberCount.toLocaleString()}</span>
          </div>
        )}
      </header>

      {/* API key row — invisible once set, but still re-editable by clicking. */}
      <div className="flex items-center gap-2">
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="Admin API key"
          className="flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-mono"
        />
        <Button
          btnText="Reload"
          color="tertiary"
          onClick={() => {
            localStorage.setItem("bo_api_key", apiKey)
            fetchHistory()
          }}
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {lastResult && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
          ✓ {lastResult}
        </div>
      )}

      {/* Compose + live preview side-by-side on wide screens, stacked otherwise. */}
      <div className="grid gap-4 md:grid-cols-[1fr,280px]">
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
              Title <span className="text-neutral-600">({title.length}/80)</span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 80))}
              placeholder="Market closing in 1 hour"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
              Body <span className="text-neutral-600">({body.length}/400)</span>
            </span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, 400))}
              placeholder="Don't miss the decision on ..."
              rows={4}
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm resize-y"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
              Click URL (optional)
            </span>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="/mini-app/trade/<pda>"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono"
            />
            <span className="text-[10px] text-neutral-600">
              Where to open when the user taps the notification. Leave as /m for the home screen.
            </span>
          </label>

          <div className="flex justify-end pt-2">
            {!confirmOpen ? (
              <Button
                btnText={`Send to ${subscriberCount ?? 0} subscribers`}
                color="primary"
                onClick={() => setConfirmOpen(true)}
                disabled={!canSend || !subscriberCount}
              />
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-amber-300">
                  Send to {subscriberCount} devices? This can't be undone.
                </span>
                <Button
                  btnText="Cancel"
                  color="tertiary"
                  onClick={() => setConfirmOpen(false)}
                  disabled={isSending}
                />
                <Button
                  btnText={isSending ? "Sending…" : "Confirm"}
                  color="primary"
                  onClick={handleSend}
                  disabled={isSending}
                />
              </div>
            )}
          </div>
        </div>

        {/* Live preview — styled roughly like a mobile system banner.
            Not pixel-perfect per-OS, but close enough that an admin
            notices an obvious typo or overflow before sending. */}
        <div className="flex flex-col gap-2">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-semibold">
            Preview
          </span>
          <div className="rounded-2xl border border-white/10 bg-black p-4 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
                  Spark-it · now
                </div>
                <div className="text-sm font-bold text-white truncate">
                  {title || "Notification title"}
                </div>
                <div className="text-xs text-neutral-300 mt-0.5 line-clamp-3 break-words">
                  {body || "Notification body goes here."}
                </div>
                {url && (
                  <div className="mt-2 text-[10px] text-neutral-600 font-mono truncate">
                    → {url}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent broadcasts — read-only log. */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Text as="h3" variant="title-20">Recent broadcasts</Text>
          <button
            className="text-xs text-neutral-500 hover:text-white transition-colors"
            onClick={() => fetchHistory()}
            disabled={isLoading}
          >
            {isLoading ? "Loading…" : "Refresh"}
          </button>
        </div>

        {broadcasts.length === 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-neutral-500">
            No broadcasts yet.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-3 py-2 text-left">Sent</th>
                  <th className="px-3 py-2 text-left">Title</th>
                  <th className="px-3 py-2 text-left">Body</th>
                  <th className="px-3 py-2 text-right">Delivered</th>
                </tr>
              </thead>
              <tbody>
                {broadcasts.map((b) => (
                  <tr key={b.id} className="border-t border-white/[0.06]">
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-400 font-mono text-[11px]">
                      {new Date(b.sent_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold text-white max-w-[200px] truncate">
                      {b.title}
                    </td>
                    <td className="px-3 py-2 text-neutral-300 max-w-[360px] truncate">
                      {b.body}
                    </td>
                    <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
                      <span className="text-green-400">{b.success_count}</span>
                      <span className="text-neutral-600">/{b.recipient_count}</span>
                      {b.removed_count > 0 && (
                        <span className="ml-2 text-[10px] text-neutral-500">
                          ({b.removed_count} pruned)
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default BroadcastNotificationsManager
