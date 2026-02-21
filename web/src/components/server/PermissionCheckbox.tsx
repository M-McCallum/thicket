interface PermissionCheckboxProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

export default function PermissionCheckbox({ label, description, checked, onChange, disabled }: PermissionCheckboxProps) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg transition-colors cursor-pointer ${
        disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-sol-bg-elevated/30'
      }`}
    >
      <div className="pt-0.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => !disabled && onChange(!checked)}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0 ${
            checked
              ? 'bg-sol-amber border-sol-amber'
              : 'border-sol-text-muted/40 hover:border-sol-text-muted'
          } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {checked && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-sol-text-primary">{label}</div>
        <div className="text-xs text-sol-text-muted mt-0.5">{description}</div>
      </div>
    </label>
  )
}
