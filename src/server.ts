// =============================================================================
// PYTHON EXECUTOR REST API SERVER
// Express.js server providing secure Python execution endpoints
// =============================================================================

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { PythonExecutor } from './index.js';
import {
  APIResponse,
  ValidationError,
  ExecutionError,
  CodeExecution
} from '@python-portal/types';

const app = express();
const PORT = process.env.PORT || 3002;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configure executor with environment variables
const executor = new PythonExecutor({
  timeout: parseInt(process.env.EXECUTION_TIMEOUT || '10000'),
  memoryLimit: parseInt(process.env.MEMORY_LIMIT || '128'),
  maxOutputLength: parseInt(process.env.MAX_OUTPUT_LENGTH || '10000'),
  maxCodeLength: parseInt(process.env.MAX_CODE_LENGTH || '50000'),
  enableSandbox: process.env.ENABLE_SANDBOX !== 'false',
  pythonPath: process.env.PYTHON_PATH || 'python3'
});

// Rate limiting state (in-memory for simplicity)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || '60000'); // 1 minute
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100');

// =============================================================================
// MIDDLEWARE CONFIGURATION
// =============================================================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

app.use(compression());
app.use(cors({ 
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id']
}));

app.use(express.json({ 
  limit: '1mb',
  type: 'application/json'
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '1mb' 
}));

// Request logging
if (NODE_ENV !== 'test') {
  app.use(morgan('combined'));
}

// Correlation ID middleware
app.use((req, res, next) => {
  req.correlationId = req.headers['x-correlation-id'] as string || 
    `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('x-correlation-id', req.correlationId);
  next();
});

// Rate limiting middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api/execute')) {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const clientLimit = rateLimitMap.get(clientIP);
    
    if (clientLimit) {
      if (now > clientLimit.resetTime) {
        // Reset the limit
        rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
      } else if (clientLimit.count >= RATE_LIMIT_MAX) {
        return sendError(res, 'Rate limit exceeded', 429);
      } else {
        clientLimit.count++;
      }
    } else {
      rateLimitMap.set(clientIP, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    }
  }
  
  next();
});

// =============================================================================
// RESPONSE HELPERS
// =============================================================================

/**
 * Send successful API response
 */
function sendSuccess<T>(
  res: express.Response, 
  data: T, 
  message?: string, 
  statusCode = 200
): void {
  const response: APIResponse<T> = {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString(),
    correlationId: res.getHeader('x-correlation-id') as string,
    version: '1.0.0'
  };
  res.status(statusCode).json(response);
}

/**
 * Send error API response
 */
function sendError(
  res: express.Response,
  error: string,
  statusCode = 500,
  details?: any
): void {
  const response: APIResponse = {
    success: false,
    error,
    message: statusCode >= 500 ? 'Internal server error' : error,
    timestamp: new Date().toISOString(),
    correlationId: res.getHeader('x-correlation-id') as string,
    version: '1.0.0'
  };
  
  if (NODE_ENV === 'development' && details) {
    (response as any).details = details;
  }
  
  res.status(statusCode).json(response);
}

/**
 * Async route wrapper
 */
function asyncHandler(
  fn: (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<any>
) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

// Basic health check
app.get('/health', (req, res) => {
  const metrics = executor.getMetrics();
  const activeExecutions = executor.getActiveExecutionCount();
  
  sendSuccess(res, {
    status: 'healthy',
    service: 'python-portal-executor',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    activeExecutions,
    totalExecutions: metrics.totalExecutions
  }, 'Service is healthy');
});

// Readiness probe
app.get('/health/ready', (req, res) => {
  const activeExecutions = executor.getActiveExecutionCount();
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_EXECUTIONS || '10');
  
  if (activeExecutions < maxConcurrent) {
    sendSuccess(res, { ready: true }, 'Service is ready');
  } else {
    sendError(res, 'Service overloaded', 503);
  }
});

// Liveness probe
app.get('/health/live', (req, res) => {
  sendSuccess(res, { alive: true }, 'Service is alive');
});

// =============================================================================
// API ROUTES
// =============================================================================

// Execute Python code
app.post('/api/execute', asyncHandler(async (req, res) => {
  const executionRequest: CodeExecution = req.body;
  
  console.log(`[${req.correlationId}] Executing code for exercise: ${executionRequest.exerciseId}`);
  
  try {
    const result = await executor.execute(executionRequest);
    
    console.log(`[${req.correlationId}] Execution completed in ${result.executionTime}ms`);
    
    sendSuccess(res, result, 'Code executed successfully');
    
  } catch (error) {
    console.error(`[${req.correlationId}] Execution failed:`, error);
    
    if (error instanceof ValidationError) {
      sendError(res, error.message, 400);
    } else if (error instanceof ExecutionError) {
      sendError(res, error.message, 422);
    } else {
      sendError(res, 'Code execution failed', 500);
    }
  }
}));

// Get executor metrics
app.get('/api/metrics', (req, res) => {
  const metrics = executor.getMetrics();
  const activeExecutions = executor.getActiveExecutionCount();
  
  sendSuccess(res, {
    ...metrics,
    activeExecutions,
    successRate: metrics.totalExecutions > 0 
      ? (metrics.successfulExecutions / metrics.totalExecutions * 100).toFixed(2)
      : 0,
    uptime: process.uptime()
  }, 'Metrics retrieved successfully');
});

// Get execution statistics
app.get('/api/stats', (req, res) => {
  const metrics = executor.getMetrics();
  
  sendSuccess(res, {
    totalExecutions: metrics.totalExecutions,
    successfulExecutions: metrics.successfulExecutions,
    failedExecutions: metrics.failedExecutions,
    averageExecutionTime: Math.round(metrics.averageExecutionTime),
    peakMemoryUsage: Math.round(metrics.peakMemoryUsage / 1024 / 1024), // MB
    securityViolations: metrics.securityViolations,
    timeouts: metrics.timeouts,
    activeExecutions: executor.getActiveExecutionCount()
  }, 'Statistics retrieved successfully');
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// Handle 404s
app.use((req, res) => {
  sendError(res, `Endpoint not found: ${req.method} ${req.path}`, 404);
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[${req.correlationId}] Unhandled error:`, error);
  
  if (error instanceof ValidationError) {
    return sendError(res, error.message, 400);
  }
  
  if (error instanceof ExecutionError) {
    return sendError(res, error.message, 422);
  }
  
  if (error.name === 'SyntaxError' && error.message.includes('JSON')) {
    return sendError(res, 'Invalid JSON in request body', 400);
  }
  
  if (error.code === 'ECONNABORTED') {
    return sendError(res, 'Request timeout', 408);
  }
  
  sendError(res, 'An unexpected error occurred', 500, 
    NODE_ENV === 'development' ? error.stack : undefined
  );
});

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Shutdown executor
  await executor.shutdown();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // Shutdown executor
  await executor.shutdown();
  
  process.exit(0);
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

const server = app.listen(PORT, () => {
  console.log(`🔒 Python Portal Executor running on port ${PORT}`);
  console.log(`🎆 Environment: ${NODE_ENV}`);
  console.log(`🌐 CORS origin: ${CORS_ORIGIN}`);
  console.log(`⏱️  Execution timeout: ${executor.getMetrics ? 'Configured' : 'Default'}`);
  console.log(`📋 Memory limit: ${process.env.MEMORY_LIMIT || '128'}MB`);
  console.log(`🔒 Sandbox mode: ${process.env.ENABLE_SANDBOX !== 'false' ? 'Enabled' : 'Disabled'}`);
});

export { app, executor };

// Type augmentation for Express
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
    }
  }
}