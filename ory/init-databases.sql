-- Create databases for Ory Kratos and Hydra
-- This script runs once when the PostgreSQL container is first created.
-- Files in /docker-entrypoint-initdb.d/ are only executed on fresh volumes.

CREATE DATABASE kratos;
CREATE DATABASE hydra;
