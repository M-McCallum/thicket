import { useState, useEffect, useCallback } from 'react'
import { useServerStore } from '@/stores/serverStore'
import { usePermissionStore } from '@/stores/permissionStore'
import { automod as automodApi } from '@/services/api'
import type { AutoModRule, Channel, Role } from '@/types/models'

type RuleType = 'keyword' | 'regex' | 'spam' | 'invite_links' | 'mention_spam'
type ActionType = 'delete' | 'timeout' | 'alert'

const RULE_TYPE_LABELS: Record<RuleType, string> = {
  keyword: 'Keyword Filter',
  regex: 'Regex Filter',
  spam: 'Spam Detection',
  invite_links: 'Invite Links',
  mention_spam: 'Mention Spam',
}

const ACTION_LABELS: Record<ActionType, string> = {
  delete: 'Delete Message',
  timeout: 'Timeout User',
  alert: 'Send Alert',
}

const TIMEOUT_OPTIONS = [
  { value: 60, label: '1 minute' },
  { value: 300, label: '5 minutes' },
  { value: 600, label: '10 minutes' },
  { value: 3600, label: '1 hour' },
  { value: 86400, label: '1 day' },
]

interface RuleFormData {
  name: string
  type: RuleType
  triggerData: Record<string, unknown>
  action: ActionType
  actionMetadata: Record<string, unknown>
  enabled: boolean
  exemptRoles: string[]
  exemptChannels: string[]
}

const defaultFormData: RuleFormData = {
  name: '',
  type: 'keyword',
  triggerData: { keywords: [] },
  action: 'delete',
  actionMetadata: {},
  enabled: true,
  exemptRoles: [],
  exemptChannels: [],
}

export default function AutoModPanel() {
  const activeServerId = useServerStore((s) => s.activeServerId)
  const channels = useServerStore((s) => s.channels)
  const roles = usePermissionStore((s) => s.roles)

  const [rules, setRules] = useState<AutoModRule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingRule, setEditingRule] = useState<AutoModRule | null>(null)
  const [formData, setFormData] = useState<RuleFormData>(defaultFormData)
  const [saving, setSaving] = useState(false)

  const textChannels = channels.filter((c: Channel) => c.type === 'text')
  const nonEveryoneRoles = roles.filter((r: Role) => r.name !== '@everyone')

  const fetchRules = useCallback(async () => {
    if (!activeServerId) return
    setLoading(true)
    try {
      const result = await automodApi.list(activeServerId)
      setRules(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rules')
    } finally {
      setLoading(false)
    }
  }, [activeServerId])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const handleToggleEnabled = async (rule: AutoModRule) => {
    if (!activeServerId) return
    try {
      const updated = await automodApi.update(activeServerId, rule.id, { enabled: !rule.enabled })
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to toggle rule')
    }
  }

  const handleEdit = (rule: AutoModRule) => {
    setEditingRule(rule)
    setFormData({
      name: rule.name,
      type: rule.type,
      triggerData: rule.trigger_data,
      action: rule.action,
      actionMetadata: rule.action_metadata,
      enabled: rule.enabled,
      exemptRoles: rule.exempt_roles,
      exemptChannels: rule.exempt_channels,
    })
    setShowForm(true)
  }

  const handleDelete = async (ruleId: string) => {
    if (!activeServerId) return
    try {
      await automodApi.delete(activeServerId, ruleId)
      setRules((prev) => prev.filter((r) => r.id !== ruleId))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete rule')
    }
  }

  const handleAddNew = () => {
    setEditingRule(null)
    setFormData({ ...defaultFormData, triggerData: { keywords: [] } })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingRule(null)
    setError('')
  }

  const handleSave = async () => {
    if (!activeServerId || !formData.name.trim()) return
    setSaving(true)
    setError('')
    try {
      const payload = {
        name: formData.name.trim(),
        type: formData.type,
        trigger_data: formData.triggerData,
        action: formData.action,
        action_metadata: formData.actionMetadata,
        enabled: formData.enabled,
        exempt_roles: formData.exemptRoles,
        exempt_channels: formData.exemptChannels,
      }

      if (editingRule) {
        const updated = await automodApi.update(activeServerId, editingRule.id, payload)
        setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
      } else {
        const created = await automodApi.create(activeServerId, payload)
        setRules((prev) => [...prev, created])
      }
      setShowForm(false)
      setEditingRule(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save rule')
    } finally {
      setSaving(false)
    }
  }

  const updateTriggerData = (key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      triggerData: { ...prev.triggerData, [key]: value },
    }))
  }

  const updateActionMetadata = (key: string, value: unknown) => {
    setFormData((prev) => ({
      ...prev,
      actionMetadata: { ...prev.actionMetadata, [key]: value },
    }))
  }

  const toggleArrayItem = (arr: string[], item: string): string[] => {
    return arr.includes(item) ? arr.filter((i) => i !== item) : [...arr, item]
  }

  if (loading) {
    return <div className="text-sol-text-muted text-sm">Loading AutoMod rules...</div>
  }

  if (showForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-sol-text-primary">
            {editingRule ? 'Edit Rule' : 'New AutoMod Rule'}
          </h3>
          <button onClick={handleCancel} className="text-sol-text-muted hover:text-sol-text-primary text-sm">
            Cancel
          </button>
        </div>

        {/* Name */}
        <div>
          <label className="block text-sm text-sol-text-secondary mb-1">Rule Name</label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            maxLength={100}
            placeholder="e.g. Block bad words"
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
          />
        </div>

        {/* Type */}
        {!editingRule && (
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Rule Type</label>
            <select
              value={formData.type}
              onChange={(e) => {
                const type = e.target.value as RuleType
                let triggerData: Record<string, unknown> = {}
                if (type === 'keyword') triggerData = { keywords: [] }
                else if (type === 'regex') triggerData = { pattern: '' }
                else if (type === 'spam') triggerData = { threshold: 5, interval_seconds: 10 }
                else if (type === 'mention_spam') triggerData = { max_mentions: 5 }
                setFormData((prev) => ({ ...prev, type, triggerData }))
              }}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
            >
              {Object.entries(RULE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        )}

        {/* Type-specific config */}
        <div>
          <label className="block text-sm text-sol-text-secondary mb-1">Configuration</label>
          {formData.type === 'keyword' && (
            <div>
              <p className="text-xs text-sol-text-muted mb-1">One keyword per line (case-insensitive)</p>
              <textarea
                value={((formData.triggerData.keywords as string[]) || []).join('\n')}
                onChange={(e) => updateTriggerData('keywords', e.target.value.split('\n').filter((k) => k.trim()))}
                rows={5}
                placeholder="bad word&#10;another word"
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30 font-mono"
              />
            </div>
          )}

          {formData.type === 'regex' && (
            <div>
              <p className="text-xs text-sol-text-muted mb-1">Regular expression pattern</p>
              <input
                type="text"
                value={(formData.triggerData.pattern as string) || ''}
                onChange={(e) => updateTriggerData('pattern', e.target.value)}
                placeholder="(?i)bad\s*word"
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/30 font-mono"
              />
            </div>
          )}

          {formData.type === 'spam' && (
            <div className="flex gap-4">
              <div className="flex-1">
                <p className="text-xs text-sol-text-muted mb-1">Message threshold</p>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={(formData.triggerData.threshold as number) || 5}
                  onChange={(e) => updateTriggerData('threshold', parseInt(e.target.value) || 5)}
                  className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
              </div>
              <div className="flex-1">
                <p className="text-xs text-sol-text-muted mb-1">Interval (seconds)</p>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={(formData.triggerData.interval_seconds as number) || 10}
                  onChange={(e) => updateTriggerData('interval_seconds', parseInt(e.target.value) || 10)}
                  className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
                />
              </div>
            </div>
          )}

          {formData.type === 'invite_links' && (
            <p className="text-sm text-sol-text-muted italic">
              Detects discord.gg and similar invite links automatically. No additional configuration needed.
            </p>
          )}

          {formData.type === 'mention_spam' && (
            <div>
              <p className="text-xs text-sol-text-muted mb-1">Max mentions per message</p>
              <input
                type="number"
                min={1}
                max={100}
                value={(formData.triggerData.max_mentions as number) || 5}
                onChange={(e) => updateTriggerData('max_mentions', parseInt(e.target.value) || 5)}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
              />
            </div>
          )}
        </div>

        {/* Action */}
        <div>
          <label className="block text-sm text-sol-text-secondary mb-1">Action</label>
          <select
            value={formData.action}
            onChange={(e) => {
              const action = e.target.value as ActionType
              let actionMetadata: Record<string, unknown> = {}
              if (action === 'timeout') actionMetadata = { timeout_duration: 300 }
              else if (action === 'alert') actionMetadata = { alert_channel_id: '' }
              setFormData((prev) => ({ ...prev, action, actionMetadata }))
            }}
            className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
          >
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* Action-specific config */}
        {formData.action === 'timeout' && (
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Timeout Duration</label>
            <select
              value={(formData.actionMetadata.timeout_duration as number) || 300}
              onChange={(e) => updateActionMetadata('timeout_duration', parseInt(e.target.value))}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
            >
              {TIMEOUT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        )}

        {formData.action === 'alert' && (
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Alert Channel</label>
            <select
              value={(formData.actionMetadata.alert_channel_id as string) || ''}
              onChange={(e) => updateActionMetadata('alert_channel_id', e.target.value)}
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2 text-sol-text-primary focus:outline-none focus:border-sol-amber/30"
            >
              <option value="">Same channel</option>
              {textChannels.map((ch: Channel) => (
                <option key={ch.id} value={ch.id}>#{ch.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Exempt Roles */}
        {nonEveryoneRoles.length > 0 && (
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Exempt Roles</label>
            <div className="flex flex-wrap gap-2">
              {nonEveryoneRoles.map((role: Role) => (
                <button
                  key={role.id}
                  onClick={() => setFormData((prev) => ({ ...prev, exemptRoles: toggleArrayItem(prev.exemptRoles, role.id) }))}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    formData.exemptRoles.includes(role.id)
                      ? 'bg-sol-amber/20 text-sol-amber border border-sol-amber/40'
                      : 'bg-sol-bg-tertiary text-sol-text-muted border border-sol-bg-elevated hover:text-sol-text-primary'
                  }`}
                >
                  {role.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Exempt Channels */}
        {textChannels.length > 0 && (
          <div>
            <label className="block text-sm text-sol-text-secondary mb-1">Exempt Channels</label>
            <div className="flex flex-wrap gap-2">
              {textChannels.map((ch: Channel) => (
                <button
                  key={ch.id}
                  onClick={() => setFormData((prev) => ({ ...prev, exemptChannels: toggleArrayItem(prev.exemptChannels, ch.id) }))}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    formData.exemptChannels.includes(ch.id)
                      ? 'bg-sol-amber/20 text-sol-amber border border-sol-amber/40'
                      : 'bg-sol-bg-tertiary text-sol-text-muted border border-sol-bg-elevated hover:text-sol-text-primary'
                  }`}
                >
                  #{ch.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {error && <p className="text-sm text-sol-coral">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sol-text-muted hover:text-sol-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.name.trim()}
            className="px-4 py-2 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-sol-text-primary">AutoMod Rules</h3>
        <button
          onClick={handleAddNew}
          className="px-3 py-1.5 bg-sol-amber/20 text-sol-amber rounded-lg hover:bg-sol-amber/30 transition-colors text-sm font-medium"
        >
          Add Rule
        </button>
      </div>

      {error && <p className="text-sm text-sol-coral">{error}</p>}

      {rules.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sol-text-muted text-sm">No AutoMod rules configured yet.</p>
          <p className="text-sol-text-muted text-xs mt-1">
            Create rules to automatically moderate messages in this server.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg p-3 flex items-center gap-3"
            >
              {/* Enable/disable toggle */}
              <button
                onClick={() => handleToggleEnabled(rule)}
                className={`w-10 h-5 rounded-full relative transition-colors flex-shrink-0 ${
                  rule.enabled ? 'bg-sol-green' : 'bg-sol-bg-elevated'
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    rule.enabled ? 'left-5' : 'left-0.5'
                  }`}
                />
              </button>

              {/* Rule info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-sol-text-primary truncate">{rule.name}</span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sol-bg-elevated text-sol-text-muted">
                    {RULE_TYPE_LABELS[rule.type]}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sol-bg-elevated text-sol-text-muted">
                    {ACTION_LABELS[rule.action]}
                  </span>
                </div>
                {rule.exempt_roles.length > 0 && (
                  <p className="text-xs text-sol-text-muted mt-0.5">
                    {rule.exempt_roles.length} exempt role{rule.exempt_roles.length > 1 ? 's' : ''}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => handleEdit(rule)}
                  className="p-1.5 text-sol-text-muted hover:text-sol-amber transition-colors rounded"
                  title="Edit"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  className="p-1.5 text-sol-text-muted hover:text-sol-coral transition-colors rounded"
                  title="Delete"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
