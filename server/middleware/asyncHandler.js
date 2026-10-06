export const asyncHandler = (fn, options = {}) => {
  // Validate input
  if (typeof fn !== "function") {
    throw new Error("asyncHandler requires a function as first argument");
  }

  const { timeout, name } = options;

  return async (req, res, next) => {
    try {
      // Optional timeout protection
      if (timeout) {
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => {
            const error = new Error(`Request timeout after ${timeout}ms`);
            error.code = "REQUEST_TIMEOUT";
            error.statusCode = 504;
            reject(error);
          }, timeout);
        });

        await Promise.race([
          Promise.resolve(fn(req, res, next)),
          timeoutPromise,
        ]);
      } else {
        await Promise.resolve(fn(req, res, next));
      }
    } catch (error) {
      // Add context to error for better debugging
      error.route = name || fn.name || "anonymous";
      error.path = req.path;
      error.method = req.method;
      error.timestamp = new Date().toISOString();

      // Log in development for easier debugging
      if (process.env.NODE_ENV === "development") {
        console.error(`\n❌ Async handler error in ${error.route}:`);
        console.error(`   ${error.method} ${error.path}`);
        console.error(`   ${error.message}\n`);
      }

      next(error);
    }
  };
};

export const batchAsyncHandler = (handlers) => {
  if (!Array.isArray(handlers)) {
    throw new Error("batchAsyncHandler requires an array of functions");
  }

  handlers.forEach((handler, index) => {
    if (typeof handler !== "function") {
      throw new Error(`Handler at index ${index} is not a function`);
    }
  });

  return async (req, res, next) => {
    try {
      for (const handler of handlers) {
        await Promise.resolve(handler(req, res, next));

        // If response was sent, stop executing handlers
        if (res.headersSent) {
          return;
        }
      }
    } catch (error) {
      next(error);
    }
  };
};

export const asyncHandlerWithRetry = (fn, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    shouldRetry = (error) => error.code !== "REQUEST_TIMEOUT",
  } = options;

  return async (req, res, next) => {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await Promise.resolve(fn(req, res, next));
        return; // Success, exit
      } catch (error) {
        lastError = error;

        // Don't retry if shouldn't or if this is the last attempt
        if (!shouldRetry(error) || attempt === maxRetries) {
          break;
        }

        // Log retry attempt in development
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `⚠️  Retry attempt ${attempt}/${maxRetries} for ${req.path}`
          );
        }

        // Wait before retrying
        await new Promise((resolve) =>
          setTimeout(resolve, retryDelay * attempt)
        );
      }
    }

    // All retries failed, pass error to error handler
    next(lastError);
  };
};

export default asyncHandler;
