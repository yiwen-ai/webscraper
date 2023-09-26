import { stderr, stdout } from 'node:process'

export interface Log {
  [index: string]: any

  level: LogLevel
  start: number
  action?: string
  msg?: string
  accept?: string
  method?: string
  requestUri?: string
  remoteAddr?: string
  xRequestID?: string
  length?: number
  status?: number
  elapsed?: number
}

// https://docs.rs/log/latest/log/enum.Level.html
export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
}

export function createLog(
  start: number = Date.now(),
  level: LogLevel = LogLevel.Info,
  msg = ''
): Log {
  const log: Log = Object.create(null)
  log.level = level
  log.start = start
  log.msg = msg
  return log
}

export function writeLog(log: Log): void {
  switch (log.level) {
    case LogLevel.Info:
    case LogLevel.Debug:
      stdout.write(JSON.stringify(log) + '\n')
      break
    default:
      stderr.write(JSON.stringify(log) + '\n')
  }
}

export function logError(err: Error): void {
  const log = createLog(Date.now(), LogLevel.Error, err.message)
  for (const key of Object.getOwnPropertyNames(err)) {
    log[key] = (err as any)[key]
  }
  log.stack = err.stack
  writeLog(log)
}
