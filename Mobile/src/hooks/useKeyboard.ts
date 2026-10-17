// src/hooks/useKeyboard.ts — RN Keyboard only; no native module, no theme dep.
import { useEffect, useState } from "react";
import { Keyboard, type KeyboardEvent } from "react-native";

export function useKeyboard() {
  const [visible, setVisible] = useState(false);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    // RN's KeyboardEvent IS the flat synthetic event: endCoordinates lives directly
    // on it (NOT under .nativeEvent). The listener param type is therefore KeyboardEvent,
    // which is exactly what KeyboardEventListener = (event: KeyboardEvent) => void wants.
    const show = (e: KeyboardEvent) => {
      setVisible(true);
      // ?. kept defensively: some Android keyboardDidShow payloads historically omit it.
      setHeight(e.endCoordinates?.height ?? 0);
    };
    const hide = () => {
      setVisible(false);
      setHeight(0);
    };

    const s = Keyboard.addListener("keyboardDidShow", show);
    const h = Keyboard.addListener("keyboardDidHide", hide);
    return () => {
      s.remove();
      h.remove();
    };
  }, []);

  return { visible, height };
}

export default useKeyboard;
