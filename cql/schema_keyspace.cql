CREATE KEYSPACE IF NOT EXISTS ywws
WITH replication = { 'class': 'NetworkTopologyStrategy', 'replication_factor': '3' };
USE ywws;