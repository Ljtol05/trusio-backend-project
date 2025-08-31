
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { logger } from '../lib/logger.js';

// Security patterns for detecting malicious content
const SECURITY_PATTERNS = {
  xss: [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:text\/html/gi,
    /on\w+\s*=/gi,
    /<.*?on\w+\s*=.*?>/gi,
  ],
  sqlInjection: [
    /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT|MERGE|SELECT|UPDATE|UNION|USE)\b)/gi,
    /(\b(AND|OR)\s+\d+\s*=\s*\d+)/gi,
    /('|(\\')|(;|--|\||`|@@|char|nchar|varchar|nvarchar|table)/gi,
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
    /[;&|`$()]/g,
    /\b(eval|exec|system|shell_exec|passthru|file_get_contents|file_put_contents|fopen|fwrite)\b/gi,
    /\b(rm|del|format|shutdown|halt|reboot)\b/gi,
  ],
};

// Sanitization functions
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;

  return input
    // Remove script tags and their content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    // Remove other potentially dangerous HTML tags
    .replace(/<(iframe|object|embed|link|meta|form|input|textarea|select|option)[^>]*>/gi, '')
    // Remove event handlers
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove javascript: and vbscript: protocols
    .replace(/(javascript|vbscript):/gi, '')
    // Remove data URLs that could contain HTML
    .replace(/data:text\/html[^"'\s>]*/gi, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeNumeric(input: any): number | null {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const parsed = parseFloat(input.replace(/[^0-9.-]/g, ''));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

export function sanitizeEmail(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input
    .toLowerCase()
    .replace(/[^a-z0-9@._-]/g, '')
    .trim();
}

export function sanitizeAlphanumeric(input: string): string {
  if (typeof input !== 'string') return '';
  
  return input.replace(/[^a-zA-Z0-9\s._-]/g, '').trim();
}

// Security validation functions
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

export function validateInput(input: any): { isValid: boolean; threats: string[]; sanitized?: any } {
  const threats: string[] = [];
  
  if (typeof input === 'string') {
    if (detectXSS(input)) {
      threats.push('XSS');
    }
    if (detectSQLInjection(input)) {
      threats.push('SQL_INJECTION');
    }
    if (detectPathTraversal(input)) {
      threats.push('PATH_TRAVERSAL');
    }
    if (detectCommandInjection(input)) {
      threats.push('COMMAND_INJECTION');
    }

    return {
      isValid: threats.length === 0,
      threats,
      sanitized: sanitizeString(input)
    };
  }

  if (typeof input === 'object' && input !== null) {
    const sanitizedObject: any = Array.isArray(input) ? [] : {};
    
    for (const [key, value] of Object.entries(input)) {
      const validation = validateInput(value);
      threats.push(...validation.threats);
      sanitizedObject[sanitizeString(key)] = validation.sanitized || value;
    }

    return {
      isValid: threats.length === 0,
      threats,
      sanitized: sanitizedObject
    };
  }

  return {
    isValid: true,
    threats: [],
    sanitized: input
  };
}

// Rate limiting store (in-memory for now, should use Redis in production)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

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

// Security middleware
export const securityMiddleware = (options: {
  sanitize?: boolean;
  validateInput?: boolean;
  rateLimit?: { maxRequests: number; windowMs: number };
  logThreats?: boolean;
} = {}) => {
  const {
    sanitize = true,
    validateInput: shouldValidate = true,
    rateLimit,
    logThreats = true
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
      const userAgent = req.headers['user-agent'] || 'unknown';
      const userId = (req as any).user?.id || 'anonymous';
      
      // Rate limiting
      if (rateLimit) {
        const identifier = `${clientIp}:${userId}`;
        const rateLimitResult = checkRateLimit(
          identifier, 
          rateLimit.maxRequests, 
          rateLimit.windowMs
        );
        
        if (!rateLimitResult.allowed) {
          logger.warn({
            ip: clientIp,
            userId,
            userAgent,
            url: req.originalUrl,
            method: req.method
          }, 'Rate limit exceeded');
          
          return res.status(429).json({
            ok: false,
            error: 'Rate limit exceeded',
            resetTime: new Date(rateLimitResult.resetTime).toISOString()
          });
        }
        
        // Set rate limit headers
        res.set({
          'X-RateLimit-Limit': rateLimit.maxRequests.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString()
        });
      }

      // Input validation and sanitization
      if (shouldValidate && (req.body || req.query)) {
        const allInputs = { ...req.body, ...req.query };
        const validation = validateInput(allInputs);
        
        if (!validation.isValid) {
          if (logThreats) {
            logger.warn({
              ip: clientIp,
              userId,
              userAgent,
              url: req.originalUrl,
              method: req.method,
              threats: validation.threats,
              suspiciousInput: Object.keys(allInputs)
            }, 'Security threat detected');
          }
          
          return res.status(400).json({
            ok: false,
            error: 'Invalid input detected',
            threats: validation.threats,
            code: 'SECURITY_VIOLATION'
          });
        }
        
        // Apply sanitization if enabled
        if (sanitize && validation.sanitized) {
          if (req.body) {
            req.body = validation.sanitized;
          }
        }
      }

      // Add security headers
      res.set({
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'X-XSS-Protection': '1; mode=block',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'",
      });

      next();
    } catch (error) {
      logger.error({ error, url: req.originalUrl }, 'Security middleware error');
      next(error);
    }
  };
};

// Specialized middleware for different endpoints
export const authSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 5, windowMs: 15 * 60 * 1000 }, // 5 requests per 15 minutes
  logThreats: true
});

export const apiSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 100, windowMs: 15 * 60 * 1000 }, // 100 requests per 15 minutes
  logThreats: true
});

export const publicSecurityMiddleware = securityMiddleware({
  sanitize: true,
  validateInput: true,
  rateLimit: { maxRequests: 200, windowMs: 15 * 60 * 1000 }, // 200 requests per 15 minutes
  logThreats: false
});
