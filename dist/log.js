import { stderr, stdout } from 'node:process';
// https://docs.rs/log/latest/log/enum.Level.html
export var LogLevel;
(function (LogLevel) {
    LogLevel["Error"] = "error";
    LogLevel["Warn"] = "warn";
    LogLevel["Info"] = "info";
    LogLevel["Debug"] = "debug";
})(LogLevel || (LogLevel = {}));
export function createLog(start = Date.now(), level = LogLevel.Info, msg = '') {
    const log = Object.create(null);
    log.level = level;
    log.start = start;
    log.msg = msg;
    return log;
}
export function writeLog(log) {
    switch (log.level) {
        case LogLevel.Info:
        case LogLevel.Debug:
            stdout.write(JSON.stringify(log) + '\n');
            break;
        default:
            stderr.write(JSON.stringify(log) + '\n');
    }
}
export function logError(err) {
    const log = createLog(Date.now(), LogLevel.Error, err.message);
    for (const key of Object.getOwnPropertyNames(err)) {
        log[key] = err[key];
    }
    log.stack = err.stack;
    writeLog(log);
}
