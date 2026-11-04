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
  profileStatus: 'loading' | 'ready' | 'error';
  onRetryProfile: () => void;
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
 * Kept native PNG, JPEG, and GIF uploads in their original format.
 */
export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type)) {
      reject(new Error('Please select an image file (PNG, JPG, WebP, GIF).'));
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
  profileStatus,
  onRetryProfile,
  onUpdateProfile,
  activeTheme,
  onSelectTheme,
}: SettingsTabProps) {
  const [displayName, setDisplayName] = useState(profile.displayName || profile.username || '');
  const [profilePicture, setProfilePicture] = useState<string | null>(profile.profilePicture);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [readingPhoto, setReadingPhoto] = useState(false);
  const profileEditable = profileStatus === 'ready' && !saving && !readingPhoto;
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
    if (!file || !profileEditable) return;
    e.target.value = '';
    setReadingPhoto(true);

    try {
      let dataUrl = await readFileAsDataUrl(file);
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      if (image.naturalWidth > 2048 || image.naturalHeight > 2048) {
        throw new Error('Use an image no larger than 2048 × 2048 pixels.');
      }
      // Converted WebP to a format validated by the Java runtime.
      if (file.type === 'image/webp') {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Could not convert the WebP image.');
        context.drawImage(image, 0, 0);
        dataUrl = canvas.toDataURL('image/png');
        const encoded = dataUrl.split(',')[1];
        if (!encoded || atob(encoded).length > 3 * 1024 * 1024) {
          throw new Error('The converted image exceeds 3 MB. Try a smaller image.');
        }
      }
      setProfilePicture(dataUrl);
      setStatusMessage(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to process image.';
      setStatusMessage({ type: 'error', text: msg });
    } finally {
      setReadingPhoto(false);
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
    if (!profileEditable) return;
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
        setSaving(false);
        setStatusMessage({
          type: 'error',
          text: 'This browser could not save the demo profile. Try a smaller photo or free up site storage.',
        });
        return;
      }
      onUpdateProfile(updatedData);
      setSaving(false);
      setStatusMessage({
        type: 'success',
        text: 'Settings updated successfully for this demo profile.',
      });
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
          displayName: trimmedName !== profile.displayName ? trimmedName : undefined,
          // Omitted unchanged photos and sent an empty value only for an explicit removal.
          profilePicture:
            resolvedPicture !== profile.profilePicture ? (resolvedPicture ?? '') : undefined,
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
    <div className="space-y-5 max-w-5xl">
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

      {profileStatus !== 'ready' && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface p-4 text-sm text-muted"
        >
          {profileStatus === 'loading'
            ? 'Loading your profile…'
            : 'Your profile could not be loaded.'}
          {profileStatus === 'error' && (
            <button
              type="button"
              className="rounded-lg border border-border bg-raised px-3 py-2 text-text hover:bg-hover-bg"
              onClick={onRetryProfile}
            >
              Try again
            </button>
          )}
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
                className="w-full h-full bg-active-bg text-active-text flex items-center justify-center font-bold text-2xl uppercase tracking-wider select-none"
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
              disabled={!profileEditable}
              onChange={handleFileChange}
              accept="image/png, image/jpeg, image/webp, image/gif"
              className="hidden"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={!profileEditable}
                className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors bg-hover-bg border border-border text-text hover:bg-raised hover:border-muted disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {readingPhoto ? 'Checking photo…' : 'Upload Photo'}
              </button>

              {profilePicture && (
                <button
                  type="button"
                  onClick={handleRemovePhoto}
                  disabled={!profileEditable}
                  className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors border border-coral/30 text-coral bg-coral/5 hover:bg-coral/15 active:scale-[0.98]"
                >
                  Remove Photo
                </button>
              )}
            </div>
            <p className="text-[11px] text-subtle m-0 leading-normal">
              PNG, JPG, WebP, or GIF · up to 3 MB and 2048 × 2048 pixels.
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
            <label
              htmlFor="user-display-name"
              className="block text-xs font-medium text-text mb-1.5"
            >
              Display Name
            </label>
            <input
              id="user-display-name"
              type="text"
              value={profileStatus === 'ready' ? displayName : ''}
              disabled={!profileEditable}
              maxLength={50}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Enter your preferred name"
              className="w-full text-xs rounded-lg border border-border bg-raised text-text px-3.5 py-2.5 outline-none focus:border-brand transition-colors"
            />
            <div className="flex justify-between items-center mt-1.5">
              <span className="text-[11px] text-subtle">
                Visible to you and across account views.
              </span>
              <span className="text-[11px] text-subtle">{displayName.length}/50</span>
            </div>
          </div>

          <div>
            <label
              htmlFor="user-login-username"
              className="block text-xs font-medium text-text mb-1.5"
            >
              Account Handle (Username)
            </label>
            <input
              id="user-login-username"
              type="text"
              value={profileStatus === 'ready' && profile.username ? `@${profile.username}` : ''}
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
            aria-pressed={themeMode === 'dark'}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'dark'
                ? 'border-primary bg-active-bg ring-1 ring-primary'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">Dark Theme</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'dark'
                    ? 'border-primary bg-primary'
                    : 'border-subtle bg-transparent'
                }`}
              >
                {themeMode === 'dark' && <span className="w-1.5 h-1.5 rounded-full bg-base" />}
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <span
                className="w-4 h-4 rounded-sm bg-[#0c1018] border border-[#232c3c]"
                title="Base"
              />
              <span
                className="w-4 h-4 rounded-sm bg-[#141b27] border border-[#232c3c]"
                title="Surface"
              />
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
            aria-pressed={themeMode === 'light'}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'light'
                ? 'border-primary bg-active-bg ring-1 ring-primary'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">Light Theme</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'light'
                    ? 'border-primary bg-primary'
                    : 'border-subtle bg-transparent'
                }`}
              >
                {themeMode === 'light' && <span className="w-1.5 h-1.5 rounded-full bg-base" />}
              </span>
            </div>
            <div className="flex gap-1.5 mb-2">
              <span
                className="w-4 h-4 rounded-sm bg-[#f3f4f7] border border-[#d4dae4]"
                title="Base"
              />
              <span
                className="w-4 h-4 rounded-sm bg-[#ffffff] border border-[#d4dae4]"
                title="Surface"
              />
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
            aria-pressed={themeMode === 'system'}
            className={`border rounded-xl p-4 text-left cursor-pointer transition-all ${
              themeMode === 'system'
                ? 'border-primary bg-active-bg ring-1 ring-primary'
                : 'border-border bg-raised hover:border-muted hover:bg-hover-bg'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-text">System Default</span>
              <span
                className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                  themeMode === 'system'
                    ? 'border-primary bg-primary'
                    : 'border-subtle bg-transparent'
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
          disabled={!hasChanges || !profileEditable}
          className="px-4 py-2.5 rounded-lg text-xs font-medium border border-border bg-transparent text-muted hover:text-text hover:bg-hover-bg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Discard Changes
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!profileEditable || !hasChanges || !displayName.trim()}
          className="px-5 py-2.5 rounded-lg text-xs font-medium bg-primary text-primary-fg hover:opacity-90 active:scale-[0.98] transition-all font-semibold disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          {saving ? 'Saving...' : 'Save profile'}
        </button>
      </div>
    </div>
  );
}
