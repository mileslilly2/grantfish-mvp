let logs: string[] = [];

export function addLog(msg: string) {
  logs.push(msg);
}

export function getLogs() {
  return logs;
}

export function clearLogs() {
  logs = [];
}
