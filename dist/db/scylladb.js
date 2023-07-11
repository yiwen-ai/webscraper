import cassandra from 'cassandra-driver';
import config from 'config';
export async function connect(keyspace) {
    const cfg = config.get('scylladb');
    const db = new cassandra.Client({
        contactPoints: cfg.contactPoints,
        authProvider: new cassandra.auth.PlainTextAuthProvider(cfg.username, cfg.password),
        localDataCenter: cfg.localDataCenter,
        keyspace
    });
    await db.connect();
    return db;
}
