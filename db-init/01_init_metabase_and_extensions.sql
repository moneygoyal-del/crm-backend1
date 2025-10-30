CREATE SCHEMA IF NOT EXISTS crm;

-- create uuid extension for the app
-- It will install in 'public', but its functions will be available globally.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- create metabase DB and user (used by Metabase to persist its app DB)
DO
$$
BEGIN
   IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_user WHERE usename = 'metabase') THEN
      CREATE USER metabase WITH PASSWORD 'MMoo@1234';
   END IF;
END
$$;

CREATE DATABASE metabase OWNER metabase;
GRANT ALL PRIVILEGES ON DATABASE metabase TO metabase;