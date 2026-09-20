const HoneypotField = () => {
  return (
    <input
      type="text"
      name="website"
      id="website"
      tabIndex={-1}
      autoComplete="off"
      defaultValue=""
      style={{
        position: "absolute",
        left: "-9999px",
        opacity: 0,
        pointerEvents: "none",
        height: 0,
        width: 0,
      }}
      aria-hidden="true"
      aria-label="Do not fill this field"
    />
  );
};

export default HoneypotField;
