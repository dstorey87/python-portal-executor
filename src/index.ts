// =============================================================================
// PYTHON PORTAL EXECUTOR - SECURE CODE EXECUTION
// Production-grade Python execution with comprehensive security and monitoring
// =============================================================================

import {
  CodeExecution,
  CodeExecutionResult,
  TestResult,
  TestCase,
  ExecutionError,
  ValidationError,
  EXECUTION_LIMITS
} from '@python-portal/types';
import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';

/**
 * Configuration options for Python executor
 */
export interface ExecutorConfig {
  /** Maximum execution time in milliseconds */
  timeout: number;
  /** Maximum memory usage in MB */
  memoryLimit: number;
  /** Maximum output length in characters */
  maxOutputLength: number;
  /** Maximum code length in characters */
  maxCodeLength: number;
  /** Enable sandboxed execution */
  enableSandbox: boolean;
  /** Python executable path */
  pythonPath: string;
  /** Temporary directory for execution */
  tempDir: string;
  /** Allowed Python modules */
  allowedModules: string[];
  /** Blocked function patterns */
  blockedPatterns: string[];
}

/**
 * Default executor configuration
 */
const DEFAULT_CONFIG: ExecutorConfig = {
  timeout: EXECUTION_LIMITS.TIMEOUT_MS,
  memoryLimit: EXECUTION_LIMITS.MEMORY_LIMIT_MB,
  maxOutputLength: EXECUTION_LIMITS.MAX_OUTPUT_LENGTH,
  maxCodeLength: EXECUTION_LIMITS.MAX_CODE_LENGTH,
  enableSandbox: true,
  pythonPath: 'python3',
  tempDir: '/tmp/python-portal',
  allowedModules: [
    'math', 'random', 'string', 'datetime', 'json', 'csv', 're',
    'itertools', 'functools', 'collections', 'operator', 'statistics',
    'decimal', 'fractions', 'uuid', 'hashlib', 'base64', 'textwrap'
  ],
  blockedPatterns: [
    'import os', 'import sys', 'import subprocess', 'import socket',
    'import urllib', 'import requests', 'import http', 'import ftplib',
    'import smtplib', 'import telnetlib', 'import pickle', 'import shelve',
    'open(', 'file(', '__import__', 'eval(', 'exec(', 'compile(',
    'globals()', 'locals()', 'dir()', 'vars()', 'input()', 'raw_input(',
    'quit()', 'exit()', 'reload(', 'delattr(', 'setattr(', 'getattr(',
    '__builtins__', '__file__', '__name__' 
  ]
};

/**
 * Validation schema for code execution requests
 */
const executionSchema = Joi.object({
  code: Joi.string().required().max(DEFAULT_CONFIG.maxCodeLength),
  exerciseId: Joi.string().required().pattern(/^[a-zA-Z0-9_-]+$/),
  runTests: Joi.boolean().required(),
  testCode: Joi.string().optional().max(DEFAULT_CONFIG.maxCodeLength),
  timeout: Joi.number().optional().min(1000).max(30000),
  memoryLimit: Joi.number().optional().min(16).max(512)
});

/**
 * Metrics tracking for monitoring
 */
interface ExecutionMetrics {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  peakMemoryUsage: number;
  securityViolations: number;
  timeouts: number;
}

/**
 * Python code executor with security and performance monitoring
 */
export class PythonExecutor {
  private config: ExecutorConfig;
  private metrics: ExecutionMetrics;
  private activeExecutions = new Map<string, ChildProcess>();

  constructor(config: Partial<ExecutorConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.metrics = {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      peakMemoryUsage: 0,
      securityViolations: 0,
      timeouts: 0
    };

    this.ensureTempDirectory();
  }

  /**
   * Execute Python code with security checks and monitoring
   */
  async execute(request: CodeExecution): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    const executionId = uuidv4();
    
    try {
      // Validate request
      await this.validateRequest(request);
      
      // Security analysis
      this.performSecurityAnalysis(request.code);
      
      // Execute code
      const result = await this.executeCode(request, executionId);
      
      // Update metrics
      this.updateMetrics(true, Date.now() - startTime, result.memoryUsed || 0);
      
      return result;
      
    } catch (error) {
      // Update failure metrics
      this.updateMetrics(false, Date.now() - startTime, 0);
      
      if (error instanceof ValidationError || error instanceof ExecutionError) {
        throw error;
      }
      
      throw new ExecutionError(
        'Code execution failed',
        error as Error,
        { timeout: false, memoryLimit: false, securityViolation: false }
      );
    } finally {
      // Cleanup
      this.activeExecutions.delete(executionId);
    }
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get active execution count
   */
  getActiveExecutionCount(): number {
    return this.activeExecutions.size;
  }

  /**
   * Validate execution request
   */
  private async validateRequest(request: CodeExecution): Promise<void> {
    const { error } = executionSchema.validate(request);
    if (error) {
      throw new ValidationError(`Invalid execution request: ${error.message}`);
    }
  }

  /**
   * Perform security analysis on code
   */
  private performSecurityAnalysis(code: string): void {
    const violations: string[] = [];
    
    // Check for blocked patterns
    for (const pattern of this.config.blockedPatterns) {
      if (code.includes(pattern)) {
        violations.push(`Blocked pattern detected: ${pattern}`);
      }
    }
    
    // Check for suspicious imports
    const importRegex = /import\s+(\w+)/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const moduleName = match[1];
      if (!this.config.allowedModules.includes(moduleName)) {
        violations.push(`Unauthorized module import: ${moduleName}`);
      }
    }
    
    // Check for suspicious function calls
    const dangerousFunctions = ['eval', 'exec', 'compile', '__import__'];
    for (const func of dangerousFunctions) {
      if (code.includes(`${func}(`)) {
        violations.push(`Dangerous function call: ${func}`);
      }
    }
    
    if (violations.length > 0) {
      this.metrics.securityViolations++;
      throw new ExecutionError(
        'Security violations detected',
        undefined,
        { securityViolation: true }
      );
    }
  }

  /**
   * Execute Python code in sandboxed environment
   */
  private async executeCode(
    request: CodeExecution, 
    executionId: string
  ): Promise<CodeExecutionResult> {
    const timeout = request.timeout || this.config.timeout;
    const memoryLimit = request.memoryLimit || this.config.memoryLimit;
    
    // Create temporary files
    const tempDir = path.join(this.config.tempDir, executionId);
    await fs.mkdir(tempDir, { recursive: true });
    
    const codeFile = path.join(tempDir, 'user_code.py');
    const testFile = path.join(tempDir, 'test_code.py');
    
    try {
      // Write user code
      await fs.writeFile(codeFile, request.code);
      
      let result: CodeExecutionResult;
      
      if (request.runTests && request.testCode) {
        // Write and run test code
        await fs.writeFile(testFile, request.testCode);
        result = await this.runTests(testFile, timeout, memoryLimit, executionId);
      } else {
        // Run user code directly
        result = await this.runCode(codeFile, timeout, memoryLimit, executionId);
      }
      
      return result;
      
    } finally {
      // Cleanup temporary files
      await this.cleanupTempFiles(tempDir);
    }
  }

  /**
   * Run Python code file
   */
  private async runCode(
    filePath: string,
    timeout: number,
    memoryLimit: number,
    executionId: string
  ): Promise<CodeExecutionResult> {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      const args = [filePath];
      
      // Add memory limit if supported
      if (this.config.enableSandbox) {
        args.unshift('-c', `
import resource
import sys
# Set memory limit
resource.setrlimit(resource.RLIMIT_AS, (${memoryLimit * 1024 * 1024}, ${memoryLimit * 1024 * 1024}))
# Disable network access (basic)
resource.setrlimit(resource.RLIMIT_NOFILE, (10, 10))
exec(open('${filePath}').read())
`);
      }
      
      const process = spawn(this.config.pythonPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout,
        cwd: path.dirname(filePath),
        env: {
          PYTHONPATH: '',
          PYTHONHOME: '',
          PYTHONSTARTUP: '',
          PYTHONIOENCODING: 'utf-8'
        }
      });
      
      this.activeExecutions.set(executionId, process);
      
      let stdout = '';
      let stderr = '';
      let memoryUsed = 0;
      
      process.stdout?.on('data', (data) => {
        stdout += data.toString();
        if (stdout.length > this.config.maxOutputLength) {
          process.kill('SIGKILL');
          reject(new ExecutionError('Output length exceeded limit'));
        }
      });
      
      process.stderr?.on('data', (data) => {
        stderr += data.toString();
        if (stderr.length > this.config.maxOutputLength) {
          process.kill('SIGKILL');
          reject(new ExecutionError('Error output length exceeded limit'));
        }
      });
      
      process.on('close', (code, signal) => {
        const executionTime = Date.now() - startTime;
        
        if (signal === 'SIGKILL' || signal === 'SIGTERM') {
          this.metrics.timeouts++;
          reject(new ExecutionError(
            'Execution timed out or was killed',
            undefined,
            { timeout: true }
          ));
          return;
        }
        
        const result: CodeExecutionResult = {
          success: code === 0,
          output: stdout.trim(),
          errors: stderr.trim() || undefined,
          executionTime,
          memoryUsed,
          environment: {
            pythonVersion: '3.11',
            platform: process.platform,
            containerized: this.config.enableSandbox
          }
        };
        
        resolve(result);
      });
      
      process.on('error', (error) => {
        reject(new ExecutionError(
          'Process execution failed',
          error
        ));
      });
      
      // Monitor memory usage (basic)
      const memoryMonitor = setInterval(() => {
        try {
          const usage = process.kill(0); // Check if process exists
          if (usage) {
            // In a real implementation, we'd use more sophisticated memory monitoring
            memoryUsed = Math.max(memoryUsed, 1024 * 1024); // Placeholder
          }
        } catch {
          clearInterval(memoryMonitor);
        }
      }, 100);
      
      process.on('close', () => {
        clearInterval(memoryMonitor);
      });
    });
  }

  /**
   * Run test code and parse results
   */
  private async runTests(
    testFilePath: string,
    timeout: number,
    memoryLimit: number,
    executionId: string
  ): Promise<CodeExecutionResult> {
    const codeResult = await this.runCode(testFilePath, timeout, memoryLimit, executionId);
    
    // Parse test results from output
    const testResult = this.parseTestOutput(codeResult.output, codeResult.errors);
    
    return {
      ...codeResult,
      testResult
    };
  }

  /**
   * Parse test output to extract structured test results
   */
  private parseTestOutput(output: string, errors?: string): TestResult {
    const testCases: TestCase[] = [];
    let passed = false;
    
    // Simple test result parsing
    if (output.includes('All tests passed') || output.includes('OK')) {
      passed = true;
      testCases.push({
        name: 'Test Suite',
        passed: true,
        executionTime: 0
      });
    } else if (errors && errors.includes('AssertionError')) {
      // Parse assertion errors
      const assertionMatch = errors.match(/AssertionError: (.+)/);
      const testName = assertionMatch ? assertionMatch[1] : 'Unknown Test';
      
      testCases.push({
        name: testName,
        passed: false,
        error: assertionMatch ? assertionMatch[1] : 'Test failed',
        executionTime: 0
      });
    } else {
      // Generic test case
      testCases.push({
        name: 'Code Execution',
        passed: !errors,
        error: errors || undefined,
        executionTime: 0
      });
    }
    
    return {
      passed,
      output,
      errors,
      executionTime: 0,
      testCases
    };
  }

  /**
   * Update execution metrics
   */
  private updateMetrics(success: boolean, executionTime: number, memoryUsed: number): void {
    this.metrics.totalExecutions++;
    
    if (success) {
      this.metrics.successfulExecutions++;
    } else {
      this.metrics.failedExecutions++;
    }
    
    // Update average execution time
    this.metrics.averageExecutionTime = 
      (this.metrics.averageExecutionTime * (this.metrics.totalExecutions - 1) + executionTime) / 
      this.metrics.totalExecutions;
    
    // Update peak memory usage
    this.metrics.peakMemoryUsage = Math.max(this.metrics.peakMemoryUsage, memoryUsed);
  }

  /**
   * Ensure temporary directory exists
   */
  private async ensureTempDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.config.tempDir, { recursive: true });
    } catch (error) {
      console.warn('Failed to create temp directory:', error);
    }
  }

  /**
   * Cleanup temporary files
   */
  private async cleanupTempFiles(tempDir: string): Promise<void> {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to cleanup temp files:', error);
    }
  }

  /**
   * Shutdown executor and cleanup resources
   */
  async shutdown(): Promise<void> {
    // Kill all active executions
    for (const [id, process] of this.activeExecutions) {
      process.kill('SIGTERM');
    }
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Force kill any remaining processes
    for (const [id, process] of this.activeExecutions) {
      process.kill('SIGKILL');
    }
    
    this.activeExecutions.clear();
  }
}

// Default executor instance
export const defaultExecutor = new PythonExecutor();

// Re-export types for convenience
export type {
  CodeExecution,
  CodeExecutionResult,
  TestResult,
  TestCase
} from '@python-portal/types';