import { Config, Redacted } from 'effect';
import * as MysqlClient from '@effect/sql-mysql2/MysqlClient';

export const DatabaseLive = MysqlClient.layerConfig({
  host: Config.string('MYSQL_HOST').pipe(Config.withDefault('localhost')),
  port: Config.number('MYSQL_PORT').pipe(Config.withDefault(3307)),
  database: Config.string('MYSQL_DATABASE').pipe(Config.withDefault('ewf_sqs_mysql')),
  username: Config.string('MYSQL_USER').pipe(Config.withDefault('workflow')),
  password: Config.redacted('MYSQL_PASSWORD').pipe(Config.withDefault(Redacted.make('workflow'))),
});
