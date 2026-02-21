interface PermissionCheckboxProps {
  label: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  danger?: boolean
}

export default function PermissionCheckbox({ label, description, checked, onChange, disabled, danger }: PermissionCheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-lg transition-all text-left group ${
        disabled
          ? 'opacity-40 cursor-not-allowed'
          : checked
            ? danger
              ? 'bg-sol-coral/[0.06] hover:bg-sol-coral/10'
              : 'bg-sol-amber/[0.06] hover:bg-sol-amber/10'
            : 'hover:bg-sol-bg-elevated/40'
      }`}
    >
      {/* Toggle switch */}
      <div
        className={`relative w-9 h-5 rounded-full shrink-0 transition-colors ${
          checked
            ? danger ? 'bg-sol-coral' : 'bg-sol-amber'
            : 'bg-sol-bg-elevated'
        }`}
      >
        <div
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-0.5'
          }`}
        />
      </div>

      <div className="flex-1 min-w-0">
        <div className={`text-[13px] font-medium leading-snug ${
          danger && checked ? 'text-sol-coral' : 'text-sol-text-primary'
        }`}>
          {label}
        </div>
        <div className="text-xs text-sol-text-muted mt-0.5 leading-relaxed">{description}</div>
      </div>
    </button>
  )
}
