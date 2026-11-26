import React from 'react';
import { LogIn, LogOut } from 'lucide-react';
import { AuthUserSummary } from '../firebase';

interface AppHeaderProps {
  user: AuthUserSummary | null;
  isConnectingAuth: boolean;
  onAuthAction: () => void;
}

/**
 * Sticky top navigation bar featuring section jump links and Google/Guest session control.
 */
export const AppHeader: React.FC<AppHeaderProps> = ({ user, isConnectingAuth, onAuthAction }) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xs border-b border-slate-200 px-4 sm:px-8 py-3.5">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
        <a
          href="#ventilation-window"
          className="text-lg font-bold tracking-tight text-emerald-800 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
        >
          SmogWise
        </a>

        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-700"
        >
          <a
            href="#ventilation-window"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
          >
            Ventilation Window
          </a>
          <a
            href="#family-profile"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
          >
            Family Profile
          </a>
          <a
            href="#action-plan"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
          >
            Action Plan
          </a>
          <a
            href="#neighborhood-impact"
            className="hover:text-slate-900 hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2 rounded"
          >
            Neighborhood Impact
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onAuthAction}
            disabled={isConnectingAuth}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-65 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
          >
            {user && !user.isAnonymous ? (
              <>
                <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                <span>Sign Out ({user.displayName?.split(' ')[0] || 'Family'})</span>
              </>
            ) : (
              <>
                <LogIn aria-hidden="true" className="w-3.5 h-3.5" />
                <span>{isConnectingAuth ? 'Connecting...' : 'Sign in with Google'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
