import { Config, Redacted } from 'effect';
import * as PgClient from '@effect/sql-pg/PgClient';

export const DatabaseLive = PgClient.layerConfig({
  host: Config.string('PG_HOST').pipe(Config.withDefault('localhost')),
  port: Config.number('PG_PORT').pipe(Config.withDefault(5433)),
  database: Config.string('PG_DATABASE').pipe(Config.withDefault('ewf_sqs_postgres')),
  username: Config.string('PG_USER').pipe(Config.withDefault('workflow')),
  password: Config.redacted('PG_PASSWORD').pipe(Config.withDefault(Redacted.make('workflow'))),
});
