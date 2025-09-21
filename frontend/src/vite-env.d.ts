/* eslint-disable @typescript-eslint/consistent-type-definitions */
/// <reference types="vite/client" />

declare global {
  const __APP_VERSION__: string;

  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
            ux_mode?: 'popup' | 'redirect';
          }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
          cancel?: () => void;
          prompt?: (momentListener?: () => void) => void;
        };
      };
    };
  }
}

export {};
