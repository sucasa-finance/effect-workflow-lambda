import { Config, Redacted } from 'effect';
import * as MysqlClient from '@effect/sql-mysql2/MysqlClient';

export const DatabaseLive = MysqlClient.layerConfig({
  host: Config.String('MYSQL_HOST').pipe(Config.withDefault('localhost')),
  port: Config.Number('MYSQL_PORT').pipe(Config.withDefault(3307)),
  database: Config.String('MYSQL_DATABASE').pipe(Config.withDefault('ewf_sqs_mysql')),
  username: Config.String('MYSQL_USER').pipe(Config.withDefault('workflow')),
  password: Config.Redacted('MYSQL_PASSWORD').pipe(Config.withDefault(Redacted.make('workflow'))),
});
