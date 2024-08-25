const cluster = require('cluster');
const os = require('os');
const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const util = require('util');

// Promisify the appendFile method to use it with async/await
const appendFile = util.promisify(fs.appendFile);

const numCPUs = os.cpus().length;

if (cluster.isMaster) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers for each CPU core
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died`);
    console.log('Starting a new worker');
    cluster.fork();
  });

} else {
  const app = express();

  // Rate limiting configuration for 20 requests per minute
  const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20, // Limit each userID to 20 requests per minute
    keyGenerator: (req) => req.headers['user-id'], // Use userID from headers as the key
  });

  // Rate limiting configuration for 1 request per second
  const taskLimiter = rateLimit({
    windowMs: 1000, // 1 second
    max: 1, // Limit each userID to 1 request per second
    keyGenerator: (req) => req.headers['user-id'], // Use userID from headers as the key
  });

  // Apply global rate limiting to all requests
  app.use(globalLimiter);

  // Task function
  async function task(user_id) {
    const logMessage = `${user_id}-task completed at-${Date.now()}\n`;
    console.log(logMessage.trim());

    // Log to a file
    try {
      await appendFile('task_logs.txt', logMessage);
    } catch (err) {
      console.error('Error writing to log file', err);
    }
  }

  // Task endpoint with rate limiting
  app.get('/task', taskLimiter, async (req, res) => {
    const userId = req.headers['user-id'];
    if (!userId) {
      return res.status(400).send('User ID is required');
    }

    await task(userId);
    res.send('Task processed');
  });

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} started`);
  });
}
