#!/bin/bash
# Combined database initialization script for DeliveryHub
# Creates all three service databases and runs their SQL init scripts

set -e

# The primary DB (POSTGRES_DB) is already created by the PostgreSQL image.
# We need to create the additional databases.

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- Create additional databases if they don't exist
    SELECT 'CREATE DATABASE driver_db OWNER $POSTGRES_USER'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'driver_db')\gexec
    SELECT 'CREATE DATABASE notification_db OWNER $POSTGRES_USER'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'notification_db')\gexec
EOSQL

# Run order service init (into POSTGRES_DB which is order_db)
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "order_db" -f /docker-entrypoint-initdb.d/order-init.sql

# Run driver service init
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "driver_db" -f /docker-entrypoint-initdb.d/driver-init.sql

# Run notification service init
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "notification_db" -f /docker-entrypoint-initdb.d/notification-init.sql
