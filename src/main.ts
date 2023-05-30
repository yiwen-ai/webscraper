import Koa from 'koa'
import config from 'config'
import { LogLevel, createLog, writeLog } from './log.js'
import { initApp } from './app.js'

const app = new Koa({
  proxy: true,
  maxIpsCount: 3
})

await initApp(app)
app.listen(config.get('port'))

writeLog(createLog(Date.now(), LogLevel.Info, `app start on port ${config.get<number>('port')}`))
