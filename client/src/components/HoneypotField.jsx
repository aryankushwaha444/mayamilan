import { useEffect, useRef } from "react";

const HoneypotField = ({ fieldName = "website" }) => {
  const inputRef = useRef(null);

  // ✅ Ensure field stays empty (some autofill tries to populate it)
  useEffect(() => {
    const interval = setInterval(() => {
      if (inputRef.current && inputRef.current.value) {
        inputRef.current.value = "";
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div
      style={{
        position: "absolute",
        left: "-9999px",
        top: "-9999px",
        height: 0,
        width: 0,
        overflow: "hidden",
        opacity: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {/* ✅ Proper label for accessibility */}
      <label htmlFor={`honeypot-${fieldName}`}>
        Do not fill this field if you are human
      </label>
      <input
        ref={inputRef}
        type="text"
        name={fieldName}
        id={`honeypot-${fieldName}`}
        tabIndex={-1}
        autoComplete="off"
        readOnly
        defaultValue=""
        aria-hidden="true"
      />
    </div>
  );
};

export default HoneypotField;
