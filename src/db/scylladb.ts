import cassandra from 'cassandra-driver'
import config from 'config'

export async function connect(keyspace: string): Promise<cassandra.Client> {
  const cfg: any = config.get('scylladb')
  const db = new cassandra.Client({
    contactPoints: cfg.contactPoints,
    authProvider: new cassandra.auth.PlainTextAuthProvider(cfg.username as string, cfg.password as string),
    localDataCenter: cfg.localDataCenter,
    keyspace
  })

  await db.connect()
  return db
}
