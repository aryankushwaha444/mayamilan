import api from "../utils/api.js";

export const submitSuggestion = async (data) => {
  const response = await api.post("/suggestions", data);
  return response.data;
};
