export type LogEntry = {
  step: string;
  status: "pending" | "done";
  duration?: number;
};

let logs: LogEntry[] = [];

export function addLog(
  step: string,
  status: "pending" | "done" = "done",
  duration?: number
) {
  logs.push({ step, status, duration });
}

export function getLogs() {
  return logs;
}

export function clearLogs() {
  logs = [];
}
