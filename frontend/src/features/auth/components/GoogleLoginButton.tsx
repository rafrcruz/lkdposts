import React, { useCallback, useEffect, useRef, useState } from 'react';

import { ENV } from '@/config/env';
import { useAuth } from '../hooks/useAuth';

type CredentialResponse = {
  credential?: string;
};

type GoogleIdentityApi = {
  accounts?: {
    id?: {
      initialize: (configuration: {
        client_id: string;
        callback: (response: CredentialResponse) => void;
        ux_mode?: 'popup' | 'redirect';
      }) => void;
      renderButton: (container: HTMLElement, options: Record<string, unknown>) => void;
      cancel?: () => void;
    };
  };
};

type GlobalWithGoogle = typeof globalThis & { google?: GoogleIdentityApi };

const getGoogleIdentityApi = (): GoogleIdentityApi | undefined => {
  return (globalThis as GlobalWithGoogle).google;
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

  const onGoogleCredential = useCallback(
    (response: CredentialResponse) => {
      handleCredential(response).catch((error) => {
        console.error('Failed to process Google credential response.', error);
      });
    },
    [handleCredential],
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
      const google = getGoogleIdentityApi();

      if (!google?.accounts?.id) {
        if (!cancelled) {
          globalThis.setTimeout(initialiseGoogle, 200);
        }
        return;
      }

      google.accounts.id.initialize({
        client_id: ENV.GOOGLE_CLIENT_ID,
        callback: onGoogleCredential,
        ux_mode: 'popup',
      });

      if (buttonContainerRef.current) {
        buttonContainerRef.current.innerHTML = '';
        const buttonOptions: Record<string, unknown> = {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          width: 280,
        };
        google.accounts.id.renderButton(buttonContainerRef.current, buttonOptions);
      }
    };

    initialiseGoogle();

    return () => {
      cancelled = true;
      getGoogleIdentityApi()?.accounts?.id?.cancel?.();
    };
  }, [onGoogleCredential]);

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



