import app from './app';
import { env } from './config/env';
import { scheduleMonthlyResets } from './tasks/resetScheduler';

const server = app.listen(env.port, () => {
  console.log(`API listening on port ${env.port}`);
});

scheduleMonthlyResets();

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());
