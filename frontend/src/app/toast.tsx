import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { CircleCheck, CircleAlert, X } from 'lucide-react';

type ToastMessage = { id: number; text: string; kind: 'success' | 'error' | 'info' };
type ToastValue = { notify: (text: string, kind?: ToastMessage['kind']) => void };
const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const notify = (text: string, kind: ToastMessage['kind'] = 'success') => {
    const id = Date.now() + Math.random();
    setMessages((current) => [...current, { id, text, kind }]);
    window.setTimeout(() => setMessages((current) => current.filter((item) => item.id !== id)), 4200);
  };
  const value = useMemo(() => ({ notify }), []);
  return <ToastContext.Provider value={value}>{children}<div className="toast-stack" aria-live="polite">{messages.map((message) => <div className={`toast toast-${message.kind}`} key={message.id}>{message.kind === 'error' ? <CircleAlert size={17} /> : <CircleCheck size={17} />}<span>{message.text}</span><button onClick={() => setMessages((items) => items.filter((item) => item.id !== message.id))} aria-label="Dismiss"><X size={15} /></button></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider.');
  return value;
}
