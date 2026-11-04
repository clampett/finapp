import { useState, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { sessionHeaders } from '../session';
import { API_BASE } from '../finance';

export interface UserProfile {
  id?: number;
  username: string;
  email?: string;
  displayName: string;
  profilePicture: string | null;
}

interface SettingsTabProps {
  userId: number;
  demo: boolean;
  profile: UserProfile;
  onUpdateProfile: (updated: UserProfile) => void;
  activeTheme: 'light' | 'dark';
  onSelectTheme: (theme: 'light' | 'dark' | 'system') => void;
}

/**
 * Extracts 1 or 2 uppercase initials from a user's display name.
 *
 * Design choice: Uses the first and last word (e.g., "Mary Jane Watson" -> "MW",
 * "Alex Rivera (Recent Grad)" -> "AG"). This ensures high-signal primary and
 * family/qualification initials while ignoring intermediate middle names.
 */
export function getInitials(name: string): string {
  if (!name || !name.trim()) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Reads an image file directly as a Base64 data URL using the browser's FileReader.
 * Avoids HTML Canvas to prevent GPU texture readback issues or uninitialized buffer stripes.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please select an image file (PNG, JPG, WebP, GIF, SVG).'));
      return;
    }
    // Limit to 3MB for database and storage performance
    if (file.size > 3 * 1024 * 1024) {
      reject(new Error('Image file size must be under 3MB.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read image data.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

export default function SettingsTab({
  userId,
  demo,
  profile,
  onUpdateProfile,
  activeTheme,
  onSelectTheme,
}: SettingsTabProps) {
  const [displayName, setDisplayName] = useState(profile.displayName || profile.username || '');
  const [profilePicture, setProfilePicture] = useState<string | null>(profile.profilePicture);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Controlled theme mode state: 'dark', 'light', or 'system'
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('user-theme');
        if (saved === 'light' || saved === 'dark') return saved;
      } catch {}
    }
    return 'system';
  });

  const systemIsLight =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: light)').matches
      : false;

  useEffect(() => {
    setDisplayName(profile.displayName || profile.username || '');
    setProfilePicture(profile.profilePicture);
  }, [profile]);

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setProfilePicture(dataUrl);
      setStatusMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      setStatusMessage({ type: 'error', text: msg });
    }
  };

  const handleRemovePhoto = () => {
    setProfilePicture(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleReset = () => {
    setDisplayName(profile.displayName || profile.username || '');
    setProfilePicture(profile.profilePicture);
    setStatusMessage(null);
  };

  const handleThemeChange = (choice: 'dark' | 'light' | 'system') => {
    setThemeMode(choice);
    onSelectTheme(choice);
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setStatusMessage({ type: 'error', text: 'Display name cannot be empty.' });
      return;
    }
    if (trimmedName.length > 50) {
      setStatusMessage({ type: 'error', text: 'Display name cannot exceed 50 characters.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    const resolvedPicture = profilePicture ? profilePicture.trim() : null;

    const updatedData: UserProfile = {
      ...profile,
      displayName: trimmedName,
      profilePicture: resolvedPicture,
    };

    if (demo) {
      // Scoped demo persistence in local storage so changes stay testable offline
      try {
        localStorage.setItem(`finapp-demo-profile:${userId}`, JSON.stringify(updatedData));
      } catch {
        /* Local memory fallback */
      }
      onUpdateProfile(updatedData);
      setSaving(false);
      setStatusMessage({ type: 'success', text: 'Settings updated successfully for this demo profile.' });
      return;
    }

    // Authenticated user: persist to Spring Boot API
    try {
      const res = await fetch(`${API_BASE}/users/me`, {
        method: 'PUT',
        headers: {
          ...sessionHeaders(),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          displayName: trimmedName,
          // Send empty string to explicitly clear photo on backend, or data URI to update
          profilePicture: resolvedPicture ?? '',
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to save settings.');
      }

      const body = await res.json();
      const serverProfile: UserProfile = {
        ...profile,
        displayName: body.data?.displayName || trimmedName,
        profilePicture: body.data?.profilePicture ?? null,
      };

      onUpdateProfile(serverProfile);
      setStatusMessage({ type: 'success', text: 'Profile settings saved successfully.' });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error saving settings.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    displayName.trim() !== (profile.displayName || profile.username || '') ||
    profilePicture !== profile.profilePicture;

  return (
    <div className="space-y-6 max-w-4xl">
      {statusMessage && (
        <div
          role="alert"
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-mint/10 border-mint/30 text-mint'
              : 'bg-coral/10 border-coral/30 text-coral'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            type="button"
            className="text-xs cursor-pointer opacity-70 hover:opacity-100 ml-4 font-semibold"
            onClick={() => setStatusMessage(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Card 1: Profile Picture (User Story 18) */}
      <section className="border border-border rounded-xl bg-surface p-6 shadow-sm">
        <h3 className="text-base font-semibold text-text m-0">Profile Picture</h3>
        <p className="text-xs text-muted mt-1 mb-5 leading-relaxed">
          Upload a custom avatar or photo to personalize your workspace.
        </p>

        <div className="flex items-center gap-6 max-[650px]:flex-col max-[650px]:items-start">
          <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-border shadow-inner bg-raised flex items-center justify-center shrink-0">
            {profilePicture ? (
              <img
                src={profilePicture}
                alt={displayName || 'User avatar'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full bg-brand/15 text-brand flex items-center justify-center font-bold text-2xl uppercase tracking-wider select-none"
                aria-label="Default avatar initials"
              >
                {getInitials(displayName || profile.username || 'User')}
              </div>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/webp, image/gif"
              className="sr-only"
              id="avatar-upload-input"
            />
            <div className="flex flex-wrap items-center gap-3">
              <label
                htmlFor="avatar-upload-input"
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-hover-bg border border-border text-text hover:bg-raised hover:border-muted active:scale-[0.98]"
              >
                Upload Photo
              </label>

              {profilePicture && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-coral/30 text-coral bg-coral/5 hover:bg-coral/15 active:scale-[0.98]"
                >
                  Remove Photo
                </button>
              )}
            </div>
            <p className="text-[11px] text-subtle m-0 leading-normal">
              Supported formats: PNG, JPG, WebP, or GIF (max 3MB).
            </p>
          </div>
        </div>
      </section>

      {/* Card 2: Display Name & Identity (User Story 20) */}
      <section className="border border-border rounded-xl bg-surface p-6 shadow-sm">
        <h3 className="text-base font-semibold text-text m-0">Display Name</h3>
        <p className="text-xs text-muted mt-1 mb-5 leading-relaxed">
          Manage how your name appears across workspace headers, dashboards, and reports.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label htmlFor="user-display-name" className="block text-xs font-medium text-text mb-1.5">
              Display Name
            </label>
            <input
              id="user-display-name"
              type="text"
              value={displayName}
              maxLength={50}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your preferred name"
              className="w-full text-xs rounded-lg border border-border bg-raised text-text px-3.5 py-2.5 outline-none focus:border-brand transition-colors"
            />
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[11px] text-subtle">
                Visible to you and across account views.
              </span>
              <span className="text-[11px] text-subtle">
                {displayName.length}/50
              </span>
            </div>
          </div>

          <div>
            <label htmlFor="user-login-username" className="block text-xs font-medium text-text mb-1.5">
              Account Handle (Username)
            </label>
            <input
              id="user-login-username"
              type="text"
              value={profile.username ? `@${profile.username}` : '@demo'}
              disabled
              className="w-full text-xs rounded-lg border border-border bg-base text-muted px-3.5 py-2.5 cursor-not-allowed select-none opacity-80"
            />
            <span className="block text-[11px] text-subtle mt-1.5">
              Your unique sign-in username cannot be altered.
            </span>
          </div>
        </div>
      </section>

      {/* Card 3: Website Theme (User Story 19) */}
      <section className="border border-border rounded-xl bg-surface p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="text-base font-semibold text-text m-0">Website Theme</h3>
            <p className="text-xs text-muted mt-1 mb-0 leading-relaxed">
              Personalize the visual appearance of your dashboard and shared financial tools.
            </p>
          </div>
          <span className="text-[11px] text-subtle border border-border px-2 py-1 rounded bg-raised whitespace-nowrap">
            Active: <strong className="text-text capitalize">{activeTheme}</strong>
          </span>
        </div>

        <p className="text-[11px] text-subtle mb-4">
          Browser preference is currently detected as{' '}
          <strong className="text-text">{systemIsLight ? 'Light' : 'Dark'}</strong> mode.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Option: Dark Theme */}
          <button
            type="button"
            onClick={() => handleThemeChange('dark')}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'dark'
                ? 'border-brand bg-active-bg ring-1 ring-brand'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">Dark Theme</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'dark' ? 'border-brand bg-brand' : 'border-subtle bg-transparent'
                }`}
              >
                {themeMode === 'dark' && <span className="w-1.5 h-1.5 rounded-full bg-base" />}
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <span className="w-4 h-4 rounded-sm bg-[#0c1018] border border-[#232c3c]" title="Base" />
              <span className="w-4 h-4 rounded-sm bg-[#141b27] border border-[#232c3c]" title="Surface" />
              <span className="w-4 h-4 rounded-sm bg-[#b8a3fa]" title="Accent" />
            </div>
            <span className="text-[11px] text-muted block leading-tight">
              Low-light palette optimized for focus.
            </span>
          </button>

          {/* Option: Light Theme */}
          <button
            type="button"
            onClick={() => handleThemeChange('light')}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'light'
                ? 'border-brand bg-active-bg ring-1 ring-brand'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">Light Theme</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'light' ? 'border-brand bg-brand' : 'border-subtle bg-transparent'
                }`}
              >
                {themeMode === 'light' && <span className="w-1.5 h-1.5 rounded-full bg-base" />}
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <span className="w-4 h-4 rounded-sm bg-[#f3f4f7] border border-[#d4dae4]" title="Base" />
              <span className="w-4 h-4 rounded-sm bg-[#ffffff] border border-[#d4dae4]" title="Surface" />
              <span className="w-4 h-4 rounded-sm bg-[#6544ad]" title="Accent" />
            </div>
            <span className="text-[11px] text-muted block leading-tight">
              Clean, daylight high-contrast palette.
            </span>
          </button>

          {/* Option: System Preference */}
          <button
            type="button"
            onClick={() => handleThemeChange('system')}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'system'
                ? 'border-brand bg-active-bg ring-1 ring-brand'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">System Default</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'system' ? 'border-brand bg-brand' : 'border-subtle bg-transparent'
                }`}
              >
                {themeMode === 'system' && <span className="w-1.5 h-1.5 rounded-full bg-base" />}
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <span className="w-4 h-4 rounded-sm bg-linear-to-r from-[#0c1018] to-[#f3f4f7] border border-border" />
              <span className="w-4 h-4 rounded-sm bg-brand" title="Brand accent" />
            </div>
            <span className="text-[11px] text-muted block leading-tight">
              Automatically matches browser or OS setting.
            </span>
          </button>
        </div>
      </section>

      {/* Action Footer */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={handleReset}
          disabled={!hasChanges || saving}
          className="px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-transparent text-muted hover:text-text hover:bg-hover-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Discard Changes
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !displayName.trim()}
          className="px-5 py-2.5 rounded-lg text-xs font-medium bg-brand text-[#0c1018] hover:opacity-90 active:scale-[0.98] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
