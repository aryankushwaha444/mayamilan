// api lives at client/src/utils/api.js and is a DEFAULT export (confirmed in api.js:
// `export default api;`), so `import api from "../utils/api.js"` is correct.
import api from "../utils/api.js";

export const getCallHistory = async ({ page = 1, limit = 20 } = {}) => {
  const { data } = await api.get("/calls/history", { params: { page, limit } });
  return data; // { success, calls, pagination }
};
