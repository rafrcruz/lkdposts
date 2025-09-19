import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ENV } from '@/config/env';
import { useAuth } from '../hooks/useAuth';

type CredentialResponse = {
  credential?: string;
};

export const GoogleLoginButton: React.FC = () => {
  const { loginWithGoogle, isAuthenticating, authError, clearAuthError } = useAuth();
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleCredential = useCallback(
    async ({ credential }: CredentialResponse) => {
      if (!credential) {
        setLocalError('Nao foi possivel obter a credencial do Google.');
        return;
      }

      try {
        await loginWithGoogle(credential);
        setLocalError(null);
        clearAuthError();
      } catch (error) {
        if (error instanceof Error) {
          setLocalError(error.message);
        } else {
          setLocalError('Falha desconhecida ao autenticar.');
        }
      }
    },
    [clearAuthError, loginWithGoogle]
  );

  useEffect(() => {
    if (!buttonContainerRef.current) {
      return;
    }

    if (!ENV.GOOGLE_CLIENT_ID) {
      setLocalError('Google Client ID nao configurado.');
      return;
    }

    let cancelled = false;

    const initialiseGoogle = () => {
      const google = window.google;

      if (!google?.accounts?.id) {
        if (!cancelled) {
          window.setTimeout(initialiseGoogle, 200);
        }
        return;
      }

      google.accounts.id.initialize({
        client_id: ENV.GOOGLE_CLIENT_ID,
        callback: (response: CredentialResponse) => {
          void handleCredential(response);
        },
        ux_mode: 'popup',
      });

      if (buttonContainerRef.current) {
        buttonContainerRef.current.innerHTML = '';
        google.accounts.id.renderButton(buttonContainerRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 280,
        });
      }
    };

    initialiseGoogle();

    return () => {
      cancelled = true;
      window.google?.accounts?.id?.cancel?.();
    };
  }, [handleCredential]);

  useEffect(() => {
    if (authError) {
      setLocalError(authError);
    }
  }, [authError]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div ref={buttonContainerRef} aria-live="polite" />
      {isAuthenticating ? (
        <p className="text-sm text-muted-foreground">Autenticando...</p>
      ) : null}
      {localError ? (
        <p className="text-sm text-destructive" role="alert">
          {localError}
        </p>
      ) : null}
    </div>
  );
};
