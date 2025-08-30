#!/usr/bin/env node

/**
 * Python Portal Executor - Production Startup Script
 * Handles graceful startup with configuration validation
 */

import { promises as fs } from 'fs';
import path from 'path';

// Configuration validation
const requiredEnvVars = [
  'NODE_ENV',
  'PORT'
];

const optionalEnvVars = {
  EXECUTION_TIMEOUT: '10000',
  MEMORY_LIMIT: '128',
  MAX_OUTPUT_LENGTH: '10000',
  MAX_CODE_LENGTH: '50000',
  ENABLE_SANDBOX: 'true',
  PYTHON_PATH: 'python3',
  RATE_LIMIT_WINDOW: '60000',
  RATE_LIMIT_MAX: '100',
  MAX_CONCURRENT_EXECUTIONS: '10'
};

/**
 * Validate environment configuration
 */
function validateEnvironment(): void {
  const missing: string[] = [];
  
  // Check required variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }
  
  // Set defaults for optional variables
  for (const [envVar, defaultValue] of Object.entries(optionalEnvVars)) {
    if (!process.env[envVar]) {
      process.env[envVar] = defaultValue;
      console.log(`⚙️  Set default ${envVar}=${defaultValue}`);
    }
  }
  
  // Validate numeric values
  const numericVars = [
    'PORT', 'EXECUTION_TIMEOUT', 'MEMORY_LIMIT', 
    'MAX_OUTPUT_LENGTH', 'MAX_CODE_LENGTH', 'RATE_LIMIT_WINDOW', 
    'RATE_LIMIT_MAX', 'MAX_CONCURRENT_EXECUTIONS'
  ];
  
  for (const envVar of numericVars) {
    const value = process.env[envVar];
    if (value && isNaN(Number(value))) {
      console.error(`❌ Invalid numeric value for ${envVar}: ${value}`);
      process.exit(1);
    }
  }
}

/**
 * Check Python installation
 */
async function checkPythonInstallation(): Promise<void> {
  const pythonPath = process.env.PYTHON_PATH || 'python3';
  
  try {
    const { spawn } = await import('child_process');
    
    return new Promise((resolve, reject) => {
      const process = spawn(pythonPath, ['--version'], { stdio: 'pipe' });
      
      let output = '';
      process.stdout?.on('data', (data) => {
        output += data.toString();
      });
      
      process.stderr?.on('data', (data) => {
        output += data.toString();
      });
      
      process.on('close', (code) => {
        if (code === 0) {
          console.log(`✅ Python installation verified: ${output.trim()}`);
          resolve();
        } else {
          reject(new Error(`Python check failed with code ${code}: ${output}`));
        }
      });
      
      process.on('error', reject);
    });
    
  } catch (error) {
    console.error('❌ Failed to check Python installation:', error);
    process.exit(1);
  }
}

/**
 * Ensure temp directory exists
 */
async function ensureTempDirectory(): Promise<void> {
  const tempDir = '/tmp/python-portal';
  
  try {
    await fs.mkdir(tempDir, { recursive: true });
    console.log(`✅ Temporary directory ready: ${tempDir}`);
  } catch (error) {
    console.error('❌ Failed to create temp directory:', error);
    process.exit(1);
  }
}

/**
 * Main startup function
 */
async function startup(): Promise<void> {
  console.log('🚀 Python Portal Executor - Starting up...');
  
  try {
    // Validate configuration
    console.log('🔧 Validating configuration...');
    validateEnvironment();
    
    // Check Python installation
    console.log('🐍 Checking Python installation...');
    await checkPythonInstallation();
    
    // Ensure temp directory
    console.log('📁 Setting up temporary directory...');
    await ensureTempDirectory();
    
    // Import and start server
    console.log('⚡ Starting server...');
    await import('./server.js');
    
  } catch (error) {
    console.error('💥 Startup failed:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled rejection:', reason);
  process.exit(1);
});

// Start the application
startup();