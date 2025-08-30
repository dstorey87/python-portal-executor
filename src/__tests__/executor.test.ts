import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { PythonExecutor } from '../src/index.js';
import { app } from '../src/server.js';
import {
  CodeExecution,
  ValidationError,
  ExecutionError
} from '@python-portal/types';

describe('PythonExecutor', () => {
  let executor: PythonExecutor;

  beforeEach(() => {
    executor = new PythonExecutor({
      timeout: 5000,
      memoryLimit: 64,
      maxOutputLength: 1000,
      maxCodeLength: 5000,
      enableSandbox: false // Disable for testing
    });
  });

  afterEach(async () => {
    await executor.shutdown();
  });

  describe('Code Execution', () => {
    test('should execute simple Python code', async () => {
      const request: CodeExecution = {
        code: 'print("Hello, World!")',
        exerciseId: 'test-hello',
        runTests: false
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(true);
      expect(result.output).toBe('Hello, World!');
      expect(result.errors).toBeUndefined();
      expect(result.executionTime).toBeGreaterThan(0);
    });

    test('should handle syntax errors', async () => {
      const request: CodeExecution = {
        code: 'print("Missing quote)',
        exerciseId: 'test-syntax-error',
        runTests: false
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('SyntaxError');
    });

    test('should handle runtime errors', async () => {
      const request: CodeExecution = {
        code: 'print(1 / 0)',
        exerciseId: 'test-runtime-error',
        runTests: false
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(false);
      expect(result.errors).toContain('ZeroDivisionError');
    });

    test('should run tests successfully', async () => {
      const request: CodeExecution = {
        code: 'def add(a, b): return a + b',
        exerciseId: 'test-with-tests',
        runTests: true,
        testCode: `
def add(a, b): return a + b

# Test cases
assert add(2, 3) == 5
assert add(-1, 1) == 0
assert add(0, 0) == 0
print("All tests passed")
`
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(true);
      expect(result.testResult).toBeDefined();
      expect(result.testResult?.passed).toBe(true);
      expect(result.output).toContain('All tests passed');
    });

    test('should handle failing tests', async () => {
      const request: CodeExecution = {
        code: 'def add(a, b): return a - b',  // Wrong implementation
        exerciseId: 'test-failing-tests',
        runTests: true,
        testCode: `
def add(a, b): return a - b  # Wrong implementation

# Test cases
assert add(2, 3) == 5  # This will fail
print("All tests passed")
`
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(false);
      expect(result.testResult).toBeDefined();
      expect(result.testResult?.passed).toBe(false);
      expect(result.errors).toContain('AssertionError');
    });
  });

  describe('Security Validation', () => {
    test('should block dangerous imports', async () => {
      const request: CodeExecution = {
        code: 'import os\nos.system("ls")',
        exerciseId: 'test-security-violation',
        runTests: false
      };

      await expect(executor.execute(request)).rejects.toThrow(ExecutionError);
    });

    test('should block eval function', async () => {
      const request: CodeExecution = {
        code: 'eval("print(\'hack\')")',
        exerciseId: 'test-eval-block',
        runTests: false
      };

      await expect(executor.execute(request)).rejects.toThrow(ExecutionError);
    });

    test('should allow safe imports', async () => {
      const request: CodeExecution = {
        code: 'import math\nprint(math.pi)',
        exerciseId: 'test-safe-import',
        runTests: false
      };

      const result = await executor.execute(request);

      expect(result.success).toBe(true);
      expect(result.output).toContain('3.14');
    });
  });

  describe('Input Validation', () => {
    test('should validate code length', async () => {
      const longCode = 'print("x")\n'.repeat(10000);  // Very long code
      const request: CodeExecution = {
        code: longCode,
        exerciseId: 'test-long-code',
        runTests: false
      };

      await expect(executor.execute(request)).rejects.toThrow(ValidationError);
    });

    test('should validate exercise ID format', async () => {
      const request: CodeExecution = {
        code: 'print("test")',
        exerciseId: 'invalid exercise id!',  // Invalid characters
        runTests: false
      };

      await expect(executor.execute(request)).rejects.toThrow(ValidationError);
    });
  });

  describe('Performance Monitoring', () => {
    test('should track execution metrics', async () => {
      const initialMetrics = executor.getMetrics();
      
      const request: CodeExecution = {
        code: 'print("metric test")',
        exerciseId: 'test-metrics',
        runTests: false
      };

      await executor.execute(request);
      
      const finalMetrics = executor.getMetrics();
      
      expect(finalMetrics.totalExecutions).toBe(initialMetrics.totalExecutions + 1);
      expect(finalMetrics.successfulExecutions).toBe(initialMetrics.successfulExecutions + 1);
      expect(finalMetrics.averageExecutionTime).toBeGreaterThan(0);
    });

    test('should track active executions', () => {
      expect(executor.getActiveExecutionCount()).toBe(0);
    });
  });
});

describe('Executor API Server', () => {
  describe('Health Endpoints', () => {
    test('GET /health should return service status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('healthy');
      expect(response.body.data.service).toBe('python-portal-executor');
    });

    test('GET /health/ready should return readiness status', async () => {
      const response = await request(app)
        .get('/health/ready')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.ready).toBe(true);
    });

    test('GET /health/live should return liveness status', async () => {
      const response = await request(app)
        .get('/health/live')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.alive).toBe(true);
    });
  });

  describe('Execution Endpoints', () => {
    test('POST /api/execute should execute code', async () => {
      const executionRequest: CodeExecution = {
        code: 'print("API test")',
        exerciseId: 'api-test',
        runTests: false
      };

      const response = await request(app)
        .post('/api/execute')
        .send(executionRequest)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.success).toBe(true);
      expect(response.body.data.output).toBe('API test');
    });

    test('POST /api/execute should validate request body', async () => {
      const invalidRequest = {
        code: 'print("test")',
        // Missing required exerciseId
        runTests: false
      };

      const response = await request(app)
        .post('/api/execute')
        .send(invalidRequest)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('exerciseId');
    });

    test('POST /api/execute should handle security violations', async () => {
      const maliciousRequest: CodeExecution = {
        code: 'import os; os.system("rm -rf /")',
        exerciseId: 'malicious-test',
        runTests: false
      };

      const response = await request(app)
        .post('/api/execute')
        .send(maliciousRequest)
        .expect(422);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Security violations');
    });
  });

  describe('Metrics Endpoints', () => {
    test('GET /api/metrics should return execution metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalExecutions');
      expect(response.body.data).toHaveProperty('successfulExecutions');
      expect(response.body.data).toHaveProperty('activeExecutions');
      expect(response.body.data).toHaveProperty('successRate');
    });

    test('GET /api/stats should return execution statistics', async () => {
      const response = await request(app)
        .get('/api/stats')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalExecutions');
      expect(response.body.data).toHaveProperty('averageExecutionTime');
      expect(response.body.data).toHaveProperty('securityViolations');
    });
  });

  describe('Error Handling', () => {
    test('should return 404 for unknown endpoints', async () => {
      const response = await request(app)
        .get('/api/unknown')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Endpoint not found');
    });

    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/execute')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid JSON');
    });
  });

  describe('CORS and Security Headers', () => {
    test('should include CORS headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    test('should include security headers', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    test('should include correlation ID in response', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-correlation-id']).toBeDefined();
      expect(response.body.correlationId).toBeDefined();
    });
  });
});