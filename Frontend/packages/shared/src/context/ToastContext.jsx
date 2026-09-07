"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  const show = useCallback((message) => {
    clearTimeout(timer.current);
    setToast({ message, id: Date.now() });
    timer.current = setTimeout(() => setToast(null), 2600);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          // Clear the bottom nav on mobile; there is none at lg.
          className="pointer-events-none absolute inset-x-0 bottom-32 z-[1100] flex justify-center px-4 lg:bottom-8"
        >
          <p className="rounded-full bg-slate-900 px-5 py-3 text-[14px] font-medium text-white shadow-lift">
            {toast.message}
          </p>
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
