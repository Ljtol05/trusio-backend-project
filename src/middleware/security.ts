
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

// Security patterns for detecting malicious content
const SECURITY_PATTERNS = {
  xss: [
    /<script[^>]*>.*?<\/script>/gi,
    /<script[^>]*>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /on\w+\s*=/gi,
    /<img[^>]*onerror[^>]*>/gi,
    /data:text\/html/gi,
    /<[^>]*script[^>]*>/gi,
  ],
  sqlInjection: [
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION|USE)\b)/gi,
    /(\b(AND|OR)\s+\d+\s*=\s*\d+)/gi,
    /(\'|\\\'|;|--|\||`|@@|char|nchar|varchar|nvarchar|table)/gi,
    /(CAST|CONVERT|DECLARE|EXEC|EXECUTE|UNION|SELECT|INSERT|UPDATE|DELETE)/gi,
    /(\bUNION\s+(ALL\s+)?SELECT\b)/gi,
    /(\bDROP\s+(TABLE|DATABASE)\b)/gi,
  ],
  pathTraversal: [
    /\.\.\/|\.\.\\|\.\.\%2f|\.\.\%5c/gi,
    /%2e%2e%2f|%2e%2e%5c/gi,
    /\.\.\//gi,
    /\.\.\\/gi,
  ],
  commandInjection: [
    /[;&|`$(){}]/,
    /(&&|\|\|)/,
    /\b(eval|exec|system|shell_exec|passthru|popen|proc_open)\s*\(/gi,
    /\$\([^)]*\)/,  // Command substitution
    /`[^`]*`/,      // Backtick command execution
  ],
};

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Recursive input validation function
export function validateInput(input: any): { isValid: boolean; threats: string[]; sanitized: any } {
  const threats: string[] = [];
  
  function processValue(value: any): any {
    if (typeof value === 'string') {
      // Check for threats
      if (detectXSS(value)) threats.push('XSS');
      if (detectSQLInjection(value)) threats.push('SQL_INJECTION');
      if (detectPathTraversal(value)) threats.push('PATH_TRAVERSAL');
      if (detectCommandInjection(value)) threats.push('COMMAND_INJECTION');
      
      // Return sanitized string
      return sanitizeString(value);
    } else if (Array.isArray(value)) {
      return value.map(processValue);
    } else if (value && typeof value === 'object') {
      const sanitized: any = {};
      for (const [key, val] of Object.entries(value)) {
        sanitized[key] = processValue(val);
      }
      return sanitized;
    }
    return value;
  }
  
  const sanitized = processValue(input);
  return {
    isValid: threats.length === 0,
    threats: [...new Set(threats)], // Remove duplicates
    sanitized
  };
}

// Security middleware
export function securityMiddleware(options: {
  sanitize?: boolean;
  validateInput?: boolean;
  rateLimit?: { maxRequests: number; windowMs: number };
} = {}) {
  const { sanitize = false, validateInput: validateInputOption = true, rateLimit } = options;
  
  return (req: any, res: any, next: any) => {
    // Add security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
    
    // Rate limiting
    if (rateLimit) {
      const clientId = req.ip || 'unknown';
      const now = Date.now();
      const windowStart = now - rateLimit.windowMs;
      
      let clientData = rateLimitStore.get(clientId);
      if (!clientData || clientData.resetTime < windowStart) {
        clientData = { count: 0, resetTime: now + rateLimit.windowMs };
        rateLimitStore.set(clientId, clientData);
      }
      
      clientData.count++;
      
      if (clientData.count > rateLimit.maxRequests) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
    }
    
    // Input validation and sanitization
    if (req.body && (validateInputOption || sanitize)) {
      const result = validateInput(req.body);
      
      if (validateInputOption && !result.isValid) {
        return res.status(400).json({
          ok: false,
          error: 'Invalid input detected',
          threats: result.threats
        });
      }
      
      if (sanitize) {
        req.body = result.sanitized;
      }
    }
    
    next();
  };
}

// Sanitization functions
export function sanitizeString(input: string): string {
  // Remove script tags and dangerous attributes
  let sanitized = input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<script[^>]*>/gi, '')
    .replace(/<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .replace(/data:text\/html/gi, '');

  return sanitized.trim();
}

export function sanitizeEmail(input: string): string {
  // First apply basic string sanitization
  let sanitized = sanitizeString(input);
  
  // Convert to lowercase and remove any remaining HTML tags or dangerous patterns
  sanitized = sanitized.toLowerCase()
    .replace(/<[^>]*>/g, '') // Remove any remaining HTML tags
    .replace(/[<>"']/g, '') // Remove potentially dangerous characters
    .replace(/onclick[^"]*"[^"]*"/gi, '') // Remove onclick handlers
    .replace(/on\w+\s*=\s*[^"]*"[^"]*"/gi, '') // Remove other event handlers
    .replace(/javascript:[^"']*/gi, '') // Remove javascript: protocols
    .replace(/alert\([^)]*\)/gi, ''); // Remove alert calls
  
  return sanitized.trim();
}

export function sanitizeAlphanumeric(input: string): string {
  // First remove dangerous patterns before applying alphanumeric filter
  let sanitized = input
    .replace(/<[^>]*>/g, '') // Remove HTML tags
    .replace(/onclick[^"]*"[^"]*"/gi, '') // Remove onclick handlers
    .replace(/on\w+\s*=\s*[^"]*"[^"]*"/gi, '') // Remove other event handlers
    .replace(/javascript:[^"']*/gi, '') // Remove javascript: protocols
    .replace(/alert\([^)]*\)/gi, '') // Remove alert calls
    .replace(/drop\s+table/gi, '') // Remove SQL injection attempts
    .replace(/`[^`]*`/g, '') // Remove backtick command execution
    .replace(/\$\([^)]*\)/g, ''); // Remove command substitution
  
  // Remove any characters that are not alphanumeric, spaces, dots, underscores, or hyphens
  return sanitized.replace(/[^a-zA-Z0-9\s._-]/g, '').trim();
}

export function sanitizeNumeric(input: any): number | null {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const parsed = parseFloat(input.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

// Threat detection functions
export function detectXSS(input: string): boolean {
  return SECURITY_PATTERNS.xss.some(pattern => pattern.test(input));
}

export function detectSQLInjection(input: string): boolean {
  return SECURITY_PATTERNS.sqlInjection.some(pattern => pattern.test(input));
}

export function detectPathTraversal(input: string): boolean {
  return SECURITY_PATTERNS.pathTraversal.some(pattern => pattern.test(input));
}

export function detectCommandInjection(input: string): boolean {
  return SECURITY_PATTERNS.commandInjection.some(pattern => pattern.test(input));
}

// Rate limiting check function
export function checkRateLimit(
  identifier: string,
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
): { allowed: boolean; remaining: number; resetTime: number } {
  const now = Date.now();
  const key = `rate_limit:${identifier}`;

  const existing = rateLimitStore.get(key);

  if (!existing || now > existing.resetTime) {
    // Create new or reset expired
    const resetTime = now + windowMs;
    rateLimitStore.set(key, { count: 1, resetTime });
    return { allowed: true, remaining: maxRequests - 1, resetTime };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetTime: existing.resetTime };
  }

  existing.count++;
  rateLimitStore.set(key, existing);

  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetTime: existing.resetTime
  };
}

// Specialized middleware for different endpoints
export const authSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 requests per 15 minutes
});

export const apiSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
});

export const publicSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 200, windowMs: 15 * 60 * 1000 }, // 200 requests per 15 minutes
});
