export {};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          disableAutoSelect: () => void;
          revoke: (email: string, done: () => void) => void;
        };
      };
    };
  }
}
