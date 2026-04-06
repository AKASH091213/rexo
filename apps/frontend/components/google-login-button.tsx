"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

interface GoogleLoginButtonProps {
  onCredential: (credential: string) => Promise<void>;
}

export function GoogleLoginButton({ onCredential }: GoogleLoginButtonProps) {
  const buttonRef = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    if (!clientId) {
      setError("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (!window.google || !buttonRef.current) {
        setError("Google login failed to initialize");
        return;
      }

      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          await onCredential(credential);
        }
      });

      buttonRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: "outline",
        size: "large",
        width: 320,
        text: "continue_with"
      });
    };

    document.body.appendChild(script);

    return () => {
      script.remove();
    };
  }, [onCredential]);

  return (
    <div className="space-y-3">
      <div ref={buttonRef} className="min-h-11" />
      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
