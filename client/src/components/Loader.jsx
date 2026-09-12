function Loader({
  full = true,
  text = "Loading",
  subtitle = "",
  icon = "heart-fill",
}) {
  return (
    <div className={`loader-wrap ${full ? "loader-full" : "loader-inline"}`}>
      <div className="loader-content">
        {/* Animated heart icon */}
        <div className="loader-icon">
          <div className="loader-heart-pulse">
            <i className={`bi bi-${icon}`}></i>
          </div>
          <div className="loader-ring"></div>
          <div className="loader-ring ring-2"></div>
        </div>

        {/* Animated bouncing dots */}
        <div className="loader-dots">
          <span className="dot"></span>
          <span className="dot"></span>
          <span className="dot"></span>
        </div>

        {/* Text */}
        {full && (
          <>
            <p className="loader-text">{text}</p>
            {subtitle && <p className="loader-subtitle">{subtitle}</p>}
          </>
        )}
      </div>
    </div>
  );
}

export default Loader;
