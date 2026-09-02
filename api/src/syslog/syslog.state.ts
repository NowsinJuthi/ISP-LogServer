export const syslogState = {
  running: false,
  port: Number(process.env.SYSLOG_UDP_PORT || 514),
  lastError: '' as string,
  receivedToday: 0,
  hourlyToday: Array.from({ length: 24 }, () => 0),
  dayKey: localDayKey(),
};

export function localDayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function emptyHours() {
  return Array.from({ length: 24 }, () => 0);
}

export function resetReceivedIfNewDay(now = new Date()) {
  const key = localDayKey(now);
  if (syslogState.dayKey !== key) {
    syslogState.dayKey = key;
    syslogState.receivedToday = 0;
    syslogState.hourlyToday = emptyHours();
  }
  return syslogState.receivedToday;
}

export function bumpReceivedToday(now = new Date()) {
  resetReceivedIfNewDay(now);
  syslogState.receivedToday += 1;
  syslogState.hourlyToday[now.getHours()] += 1;
  return syslogState.receivedToday;
}

export function currentReceivedToday(now = new Date()) {
  return resetReceivedIfNewDay(now);
}

export function currentHourly(now = new Date()) {
  resetReceivedIfNewDay(now);
  return syslogState.hourlyToday.map((count, hour) => ({ hour, count }));
}

export function resetSyslogStateForTests() {
  syslogState.receivedToday = 0;
  syslogState.hourlyToday = emptyHours();
  syslogState.dayKey = '1970-1-1';
}
