import axios from "axios";

/**
 * Cliente de la API del orquestador (v4). En dev apunta a localhost:8000;
 * si el frontend se sirve desde el mismo backend (build), usa ruta relativa.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE || "http://localhost:8000/api";

const http = axios.create({ baseURL: API_BASE_URL, timeout: 60000 });

// --- Processes -----------------------------------------------------------
export const fetchProcesses = () => http.get("/processes").then((r) => r.data);
export const fetchProcess = (id) => http.get(`/processes/${id}`).then((r) => r.data);
export const fetchBotScripts = () => http.get("/processes/bot-scripts").then((r) => r.data);
export const createProcess = (payload) => http.post("/processes", payload).then((r) => r.data);
export const updateProcess = (id, payload) => http.patch(`/processes/${id}`, payload).then((r) => r.data);
export const deleteProcess = (id) => http.delete(`/processes/${id}`).then((r) => r.data);
export const runProcess = (id) => http.post(`/processes/${id}/run`).then((r) => r.data);
export const fetchVersions = (id) => http.get(`/processes/${id}/versions`).then((r) => r.data);
export const publishVersion = (id, changelog) =>
  http.post(`/processes/${id}/versions`, { changelog }).then((r) => r.data);
export const activateVersion = (id, versionId) =>
  http.post(`/processes/${id}/versions/${versionId}/activate`).then((r) => r.data);

// --- Queues ------------------------------------------------------------
export const fetchQueues = () => http.get("/queues").then((r) => r.data);
export const createQueue = (payload) => http.post("/queues", payload).then((r) => r.data);
export const fetchQueue = (id) => http.get(`/queues/${id}`).then((r) => r.data);
export const deleteQueue = (id) => http.delete(`/queues/${id}`).then((r) => r.data);
export const fetchQueueItems = (id, params) =>
  http.get(`/queues/${id}/items`, { params }).then((r) => r.data);
export const fetchQueueItem = (itemId) => http.get(`/queue-items/${itemId}`).then((r) => r.data);
export const setQueueItemState = (itemId, status, note) =>
  http.patch(`/queue-items/${itemId}/state`, { status, note }).then((r) => r.data);
export const bulkSetQueueItemState = (queueId, payload) =>
  http.post(`/queues/${queueId}/bulk-state`, payload).then((r) => r.data);
export const deleteQueueItem = (itemId) => http.delete(`/queue-items/${itemId}`).then((r) => r.data);
export const bulkDeleteQueueItems = (queueId, payload) =>
  http.post(`/queues/${queueId}/bulk-delete`, payload).then((r) => r.data);

// --- Executions ------------------------------------------------------------
export const fetchExecutions = (arg) => {
  // arg: número/string (process_id) o un objeto { process_id, queue_id, limit }
  let params;
  if (arg && typeof arg === "object") params = { ...arg };
  else if (arg != null && arg !== "") params = { process_id: arg };
  else params = {};
  Object.keys(params).forEach((k) => {
    if (params[k] == null || params[k] === "") delete params[k];
  });
  return http.get("/executions", { params }).then((r) => r.data);
};
export const fetchExecution = (id) => http.get(`/executions/${id}`).then((r) => r.data);
// responseType/transformResponse: el log es SIEMPRE texto. Sin esto, si el
// contenido es una sola línea JSON (bot que falla y emite un self.log),
// axios lo parsea a objeto y rompe el render.
export const fetchExecutionLog = (id) =>
  http
    .get(`/executions/${id}/log`, { responseType: "text", transformResponse: [(d) => d] })
    .then((r) => (typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2)));
export const deleteExecution = (id) => http.delete(`/executions/${id}`).then((r) => r.data);
export const deleteExecutions = (ids) => http.post("/executions/delete", { ids }).then((r) => r.data);

// --- Assets ------------------------------------------------------------
export const fetchAssets = () => http.get("/assets").then((r) => r.data);
export const uploadAsset = (name, file) => {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("file", file);
  return http.post("/assets", fd).then((r) => r.data);
};
export const deleteAsset = (id) => http.delete(`/assets/${id}`).then((r) => r.data);

// --- Credentials ------------------------------------------------------------
export const fetchCredentials = () => http.get("/credentials").then((r) => r.data);
export const createCredential = (payload) => http.post("/credentials", payload).then((r) => r.data);
export const deleteCredential = (id) => http.delete(`/credentials/${id}`).then((r) => r.data);
export const revealCredential = (id) => http.get(`/credentials/${id}/reveal`).then((r) => r.data);

// --- Schedules ------------------------------------------------------------
export const fetchSchedules = () => http.get("/schedules").then((r) => r.data);
export const createSchedule = (payload) => http.post("/schedules", payload).then((r) => r.data);
export const updateSchedule = (id, payload) => http.patch(`/schedules/${id}`, payload).then((r) => r.data);
export const toggleSchedule = (id) => http.patch(`/schedules/${id}/toggle`).then((r) => r.data);
export const deleteSchedule = (id) => http.delete(`/schedules/${id}`).then((r) => r.data);

// --- Metrics ------------------------------------------------------------
export const fetchOverview = () => http.get("/metrics/overview").then((r) => r.data);
export const fetchProcessSummary = (id, days = 7) =>
  http.get(`/metrics/processes/${id}/summary`, { params: { days } }).then((r) => r.data);
export const fetchProcessTimeseries = (id, days = 14) =>
  http.get(`/metrics/processes/${id}/timeseries`, { params: { days } }).then((r) => r.data);
export const fetchDurationHistogram = (id, days = 14) =>
  http.get(`/metrics/processes/${id}/duration-histogram`, { params: { days } }).then((r) => r.data);
export const fetchQueueThroughput = (id, hours = 24) =>
  http.get(`/metrics/processes/${id}/queue-throughput`, { params: { hours } }).then((r) => r.data);

export const EVIDENCE_URL = (id) => `${API_BASE_URL}/evidence/${id}/content`;
export const EXECUTION_LOG_URL = (id) => `${API_BASE_URL}/executions/${id}/log`;

export default http;
