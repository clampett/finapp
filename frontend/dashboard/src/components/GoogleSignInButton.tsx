import React, { useEffect } from 'react';
import { loginWithGoogleToken } from '../session';

interface GoogleSignInButtonProps {
  onSuccess?: () => void;
  onFailure?: () => void;
}

declare global {
  interface Window {
    google?: any;
  }
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  onSuccess,
  onFailure,
}) => {
  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.error('VITE_GOOGLE_CLIENT_ID is missing in .env');
      return;
    }

    const handleCredentialResponse = async (response: any) => {
      const idToken = response.credential;
      const success = await loginWithGoogleToken(idToken);

      if (success) {
        if (onSuccess) onSuccess();
        // Redirect to dashboard or refresh session state
        window.location.href = '/';
      } else {
        if (onFailure) onFailure();
      }
    };

    if (window.google?.accounts?.id) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(
        document.getElementById('googleSignInBtn'),
        {
          theme: 'outline',
          size: 'large',
          width: '100%',
          text: 'signin_with',
        }
      );
    }
  }, [onSuccess, onFailure]);

  return <div id="googleSignInBtn" className="w-full flex justify-center my-3"></div>;
};