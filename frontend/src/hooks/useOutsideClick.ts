import { useEffect, useRef, RefObject } from 'react';

type OutsideClickHandler = (event: MouseEvent | TouchEvent) => void;

/**
 * Custom hook to detect clicks outside a referenced DOM element.
 *
 * Supports two flexible calling signatures:
 * 1. const ref = useOutsideClick<HTMLDivElement>(() => onClose());
 * 2. useOutsideClick(existingRef, () => onClose());
 */
export function useOutsideClick<T extends HTMLElement = HTMLElement>(
  handlerOrRef: OutsideClickHandler | RefObject<T | null>,
  maybeHandler?: OutsideClickHandler,
  listenCapturing: boolean = true
): RefObject<T | null> {
  const internalRef = useRef<T | null>(null);

  const isFirstArgRef =
    typeof handlerOrRef === 'object' && handlerOrRef !== null && 'current' in handlerOrRef;

  const targetRef = (isFirstArgRef ? handlerOrRef : internalRef) as RefObject<T | null>;
  const handler = (isFirstArgRef ? maybeHandler : handlerOrRef) as OutsideClickHandler | undefined;

  useEffect(() => {
    if (!handler) return;

    const listener = (event: MouseEvent | TouchEvent) => {
      const el = targetRef.current;
      if (!el || el.contains(event.target as Node)) {
        return;
      }
      handler(event);
    };

    document.addEventListener('mousedown', listener, listenCapturing);
    document.addEventListener('touchstart', listener, listenCapturing);

    return () => {
      document.removeEventListener('mousedown', listener, listenCapturing);
      document.removeEventListener('touchstart', listener, listenCapturing);
    };
  }, [targetRef, handler, listenCapturing]);

  return targetRef;
}

export default useOutsideClick;
