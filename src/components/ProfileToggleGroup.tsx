import { LucideIcon } from 'lucide-react';

export interface ToggleOption<T extends string> {
  value: T;
  label: string;
}

interface ProfileToggleGroupProps<T extends string> {
  labelId: string;
  label: string;
  icon: LucideIcon;
  value: T;
  options: readonly ToggleOption<T>[];
  onChange: (nextValue: T) => void;
  gridClassName?: string;
  buttonPaddingClassName?: string;
}

/**
 * Reusable accessible toggle-button group used by the 4-toggle Family Lifestyle Profile bar.
 */
export function ProfileToggleGroup<T extends string>({
  labelId,
  label,
  icon: Icon,
  value,
  options,
  onChange,
  gridClassName = 'grid grid-cols-2 gap-1 p-1 bg-slate-200/70 rounded-lg sm:w-72',
  buttonPaddingClassName = 'px-3 py-2',
}: ProfileToggleGroupProps<T>) {
  return (
    <div className="p-4 bg-slate-50/70 border border-slate-200 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div
        id={labelId}
        className="flex items-center gap-2 text-xs font-semibold text-slate-800 shrink-0"
      >
        <Icon aria-hidden="true" className="w-4 h-4 text-emerald-700 shrink-0" />
        <span>{label}</span>
      </div>
      <div
        role="group"
        aria-labelledby={labelId}
        className={gridClassName}
      >
        {options.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={isSelected}
              className={`${buttonPaddingClassName} text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 ${
                isSelected
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
