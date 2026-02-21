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

const RULE_TYPE_ICONS: Record<RuleType, React.ReactNode> = {
  keyword: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 7V4h16v3" /><path d="M9 20h6" /><path d="M12 4v16" />
    </svg>
  ),
  regex: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M17 3l-5 5-5-5" /><path d="M17 21l-5-5-5 5" /><line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  ),
  spam: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M20.24 12.24a6 6 0 00-8.49-8.49L5 10.5V19h8.5z" /><line x1="16" y1="8" x2="2" y2="22" /><line x1="17.5" y1="15" x2="9" y2="15" />
    </svg>
  ),
  invite_links: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  ),
  mention_spam: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94" />
    </svg>
  ),
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

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
      setConfirmDeleteId(null)
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

  const getRoleName = (roleId: string) => {
    const role = roles.find((r: Role) => r.id === roleId)
    return role ? role.name : roleId
  }

  const getChannelName = (channelId: string) => {
    const ch = channels.find((c: Channel) => c.id === channelId)
    return ch ? `#${ch.name}` : channelId
  }

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-sol-bg-elevated rounded-lg" />
        <div className="h-4 w-72 bg-sol-bg-elevated/50 rounded-lg" />
        <div className="h-24 bg-sol-bg-elevated/30 rounded-xl" />
        <div className="h-24 bg-sol-bg-elevated/30 rounded-xl" />
      </div>
    )
  }

  if (showForm) {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-sol-text-primary mb-1">
              {editingRule ? 'Edit Rule' : 'New AutoMod Rule'}
            </h2>
            <p className="text-sm text-sol-text-muted">
              {editingRule ? 'Modify this rule\'s triggers, actions, and exemptions.' : 'Configure what to detect and how to respond.'}
            </p>
          </div>
          <button
            onClick={handleCancel}
            className="w-8 h-8 rounded-full border border-sol-bg-elevated flex items-center justify-center text-sol-text-muted hover:text-sol-text-primary hover:border-sol-text-muted transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p className="text-sm text-sol-coral">{error}</p>
          </div>
        )}

        {/* Rule Identity */}
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
          <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Rule Identity</h4>

          <div>
            <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Rule Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
              maxLength={100}
              placeholder="e.g. Block bad words"
              className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
            />
          </div>

          {/* Enabled toggle */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-sol-text-primary">Enabled</p>
              <p className="text-xs text-sol-text-muted">Rule will be active immediately when saved</p>
            </div>
            <button
              onClick={() => setFormData((prev) => ({ ...prev, enabled: !prev.enabled }))}
              className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                formData.enabled ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
              }`}
            >
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                formData.enabled ? 'left-[22px]' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>

        {/* Trigger Type */}
        {!editingRule && (
          <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Trigger Type</h4>
            <div className="space-y-1">
              {(Object.entries(RULE_TYPE_LABELS) as [RuleType, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => {
                    let triggerData: Record<string, unknown> = {}
                    if (value === 'keyword') triggerData = { keywords: [] }
                    else if (value === 'regex') triggerData = { pattern: '' }
                    else if (value === 'spam') triggerData = { threshold: 5, interval_seconds: 10 }
                    else if (value === 'mention_spam') triggerData = { max_mentions: 5 }
                    setFormData((prev) => ({ ...prev, type: value, triggerData }))
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all ${
                    formData.type === value
                      ? 'bg-sol-amber/10 border border-sol-amber/25 text-sol-amber'
                      : 'border border-transparent text-sol-text-secondary hover:text-sol-text-primary hover:bg-sol-bg-tertiary'
                  }`}
                >
                  <span className="shrink-0">{RULE_TYPE_ICONS[value]}</span>
                  <span className="text-sm">{label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Trigger Configuration */}
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
          <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">
            {editingRule ? `${RULE_TYPE_LABELS[formData.type]} — Configuration` : 'Configuration'}
          </h4>

          {formData.type === 'keyword' && (
            <div>
              <p className="text-xs text-sol-text-muted mb-2">One keyword per line (case-insensitive match)</p>
              <textarea
                value={((formData.triggerData.keywords as string[]) || []).join('\n')}
                onChange={(e) => updateTriggerData('keywords', e.target.value.split('\n').filter((k) => k.trim()))}
                rows={5}
                placeholder={'bad word\nanother word'}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors font-mono resize-none"
              />
            </div>
          )}

          {formData.type === 'regex' && (
            <div>
              <p className="text-xs text-sol-text-muted mb-2">Regular expression pattern (Go syntax)</p>
              <input
                type="text"
                value={(formData.triggerData.pattern as string) || ''}
                onChange={(e) => updateTriggerData('pattern', e.target.value)}
                placeholder="(?i)bad\s*word"
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors font-mono"
              />
            </div>
          )}

          {formData.type === 'spam' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Threshold</label>
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={(formData.triggerData.threshold as number) || 5}
                  onChange={(e) => updateTriggerData('threshold', parseInt(e.target.value) || 5)}
                  className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                />
                <p className="text-[10px] text-sol-text-muted/60 mt-1">Messages before trigger</p>
              </div>
              <div>
                <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Interval</label>
                <input
                  type="number"
                  min={1}
                  max={300}
                  value={(formData.triggerData.interval_seconds as number) || 10}
                  onChange={(e) => updateTriggerData('interval_seconds', parseInt(e.target.value) || 10)}
                  className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
                />
                <p className="text-[10px] text-sol-text-muted/60 mt-1">Window in seconds</p>
              </div>
            </div>
          )}

          {formData.type === 'invite_links' && (
            <div className="flex items-center gap-2 px-3 py-3 rounded-lg bg-sol-bg-tertiary border border-sol-bg-elevated">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <p className="text-xs text-sol-text-muted">
                Detects discord.gg and similar invite links automatically. No additional configuration needed.
              </p>
            </div>
          )}

          {formData.type === 'mention_spam' && (
            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Max Mentions</label>
              <input
                type="number"
                min={1}
                max={100}
                value={(formData.triggerData.max_mentions as number) || 5}
                onChange={(e) => updateTriggerData('max_mentions', parseInt(e.target.value) || 5)}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              />
              <p className="text-[10px] text-sol-text-muted/60 mt-1">Maximum unique mentions allowed per message</p>
            </div>
          )}
        </div>

        {/* Action */}
        <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-3">
          <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Response Action</h4>

          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(ACTION_LABELS) as [ActionType, string][]).map(([value, label]) => (
              <button
                key={value}
                onClick={() => {
                  let actionMetadata: Record<string, unknown> = {}
                  if (value === 'timeout') actionMetadata = { timeout_duration: 300 }
                  else if (value === 'alert') actionMetadata = { alert_channel_id: '' }
                  setFormData((prev) => ({ ...prev, action: value, actionMetadata }))
                }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  formData.action === value
                    ? 'border-sol-amber/30 bg-sol-amber/10 text-sol-amber font-medium'
                    : 'border-sol-bg-elevated text-sol-text-secondary hover:border-sol-amber/20 hover:text-sol-text-primary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {formData.action === 'timeout' && (
            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Timeout Duration</label>
              <div className="flex flex-wrap gap-1.5">
                {TIMEOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateActionMetadata('timeout_duration', opt.value)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                      (formData.actionMetadata.timeout_duration as number) === opt.value
                        ? 'border-sol-amber/30 bg-sol-amber/10 text-sol-amber font-medium'
                        : 'border-sol-bg-elevated text-sol-text-secondary hover:border-sol-amber/20 hover:text-sol-text-primary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {formData.action === 'alert' && (
            <div>
              <label className="block text-xs text-sol-text-muted mb-1.5 font-mono uppercase tracking-wider">Alert Channel</label>
              <select
                value={(formData.actionMetadata.alert_channel_id as string) || ''}
                onChange={(e) => updateActionMetadata('alert_channel_id', e.target.value)}
                className="w-full bg-sol-bg-tertiary border border-sol-bg-elevated rounded-lg px-3 py-2.5 text-sol-text-primary text-sm focus:outline-none focus:border-sol-amber/40 transition-colors"
              >
                <option value="">Same channel</option>
                {textChannels.map((ch: Channel) => (
                  <option key={ch.id} value={ch.id}>#{ch.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Exemptions */}
        {(nonEveryoneRoles.length > 0 || textChannels.length > 0) && (
          <div className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl p-4 space-y-4">
            <h4 className="text-[11px] font-mono uppercase tracking-widest text-sol-text-muted/60">Exemptions</h4>

            {nonEveryoneRoles.length > 0 && (
              <div>
                <label className="block text-xs text-sol-text-muted mb-2 font-mono uppercase tracking-wider">Exempt Roles</label>
                <div className="flex flex-wrap gap-1.5">
                  {nonEveryoneRoles.map((role: Role) => (
                    <button
                      key={role.id}
                      onClick={() => setFormData((prev) => ({ ...prev, exemptRoles: toggleArrayItem(prev.exemptRoles, role.id) }))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                        formData.exemptRoles.includes(role.id)
                          ? 'bg-sol-amber/15 text-sol-amber border border-sol-amber/30 font-medium'
                          : 'bg-sol-bg-tertiary text-sol-text-secondary border border-sol-bg-elevated hover:text-sol-text-primary hover:border-sol-amber/20'
                      }`}
                    >
                      {role.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {textChannels.length > 0 && (
              <div>
                <label className="block text-xs text-sol-text-muted mb-2 font-mono uppercase tracking-wider">Exempt Channels</label>
                <div className="flex flex-wrap gap-1.5">
                  {textChannels.map((ch: Channel) => (
                    <button
                      key={ch.id}
                      onClick={() => setFormData((prev) => ({ ...prev, exemptChannels: toggleArrayItem(prev.exemptChannels, ch.id) }))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                        formData.exemptChannels.includes(ch.id)
                          ? 'bg-sol-amber/15 text-sol-amber border border-sol-amber/30 font-medium'
                          : 'bg-sol-bg-tertiary text-sol-text-secondary border border-sol-bg-elevated hover:text-sol-text-primary hover:border-sol-amber/20'
                      }`}
                    >
                      #{ch.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Save bar */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-sm text-sol-text-muted hover:text-sol-text-primary transition-colors rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !formData.name.trim()}
            className="px-5 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 disabled:opacity-40 transition-colors"
          >
            {saving ? 'Saving...' : editingRule ? 'Update Rule' : 'Create Rule'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-sol-text-primary mb-1">AutoMod</h2>
          <p className="text-sm text-sol-text-muted">Automatically moderate messages with custom rules.</p>
        </div>
        <button
          onClick={handleAddNew}
          className="px-4 py-2 bg-sol-amber/20 text-sol-amber text-sm font-medium rounded-lg hover:bg-sol-amber/30 transition-colors"
        >
          Add Rule
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-sol-coral/5 border border-sol-coral/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-sol-coral shrink-0">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="text-sm text-sol-coral">{error}</p>
        </div>
      )}

      {/* Rule list */}
      {rules.length === 0 ? (
        <div className="text-center py-10">
          <div className="w-12 h-12 rounded-2xl bg-sol-bg-elevated flex items-center justify-center mx-auto mb-3">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-sol-text-muted">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <p className="text-sm text-sol-text-muted">No AutoMod rules configured</p>
          <p className="text-xs text-sol-text-muted/60 mt-1">Create rules to automatically moderate messages.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="bg-sol-bg-secondary border border-sol-bg-elevated rounded-xl px-4 py-3"
            >
              <div className="flex items-center gap-3">
                {/* Toggle */}
                <button
                  onClick={() => handleToggleEnabled(rule)}
                  className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${
                    rule.enabled ? 'bg-sol-amber' : 'bg-sol-bg-elevated'
                  }`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
                    rule.enabled ? 'left-[22px]' : 'left-0.5'
                  }`} />
                </button>

                {/* Icon */}
                <div className="w-9 h-9 rounded-lg bg-sol-bg-elevated flex items-center justify-center shrink-0">
                  <span className="text-sol-text-muted">{RULE_TYPE_ICONS[rule.type]}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-sol-text-primary truncate">{rule.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-sol-bg-elevated text-sol-text-muted/70 font-mono">
                      {RULE_TYPE_LABELS[rule.type]}
                    </span>
                    <span className="text-[10px] text-sol-text-muted/40">&middot;</span>
                    <span className="text-[10px] text-sol-text-muted/60">{ACTION_LABELS[rule.action]}</span>
                    {(rule.exempt_roles.length > 0 || rule.exempt_channels.length > 0) && (
                      <>
                        <span className="text-[10px] text-sol-text-muted/40">&middot;</span>
                        <span className="text-[10px] text-sol-text-muted/60">
                          {rule.exempt_roles.length + rule.exempt_channels.length} exempt
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleEdit(rule)}
                    className="px-2.5 py-1.5 text-xs text-sol-text-secondary hover:text-sol-amber bg-sol-bg-elevated rounded-lg transition-colors"
                  >
                    Edit
                  </button>
                  {confirmDeleteId === rule.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="px-2.5 py-1.5 text-xs text-sol-coral bg-sol-coral/10 rounded-lg hover:bg-sol-coral/15 transition-colors"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 text-xs text-sol-text-muted hover:text-sol-text-primary transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(rule.id)}
                      className="px-2.5 py-1.5 text-xs text-sol-coral/70 hover:text-sol-coral hover:bg-sol-coral/10 rounded-lg transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded exemption details (shown when rule has exemptions) */}
              {(rule.exempt_roles.length > 0 || rule.exempt_channels.length > 0) && (
                <div className="mt-2 pt-2 border-t border-sol-bg-elevated/50 flex flex-wrap gap-1">
                  {rule.exempt_roles.map((roleId) => (
                    <span key={roleId} className="text-[10px] px-1.5 py-0.5 rounded bg-sol-bg-tertiary text-sol-text-muted/70 border border-sol-bg-elevated">
                      {getRoleName(roleId)}
                    </span>
                  ))}
                  {rule.exempt_channels.map((channelId) => (
                    <span key={channelId} className="text-[10px] px-1.5 py-0.5 rounded bg-sol-bg-tertiary text-sol-text-muted/70 border border-sol-bg-elevated">
                      {getChannelName(channelId)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
