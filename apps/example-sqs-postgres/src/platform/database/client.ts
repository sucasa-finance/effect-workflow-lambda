import { Config, Redacted } from 'effect';
import * as PgClient from '@effect/sql-pg/PgClient';

export const DatabaseLive = PgClient.layerConfig({
  host: Config.String('PG_HOST').pipe(Config.withDefault('localhost')),
  port: Config.Number('PG_PORT').pipe(Config.withDefault(5433)),
  database: Config.String('PG_DATABASE').pipe(Config.withDefault('ewf_sqs_postgres')),
  username: Config.String('PG_USER').pipe(Config.withDefault('workflow')),
  password: Config.Redacted('PG_PASSWORD').pipe(Config.withDefault(Redacted.make('workflow'))),
});
