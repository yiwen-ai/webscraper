CREATE KEYSPACE IF NOT EXISTS ywws
WITH replication = { 'class': 'SimpleStrategy', 'replication_factor': '1' };
USE ywws;