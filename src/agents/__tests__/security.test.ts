
import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { 
  sanitizeString, 
  sanitizeEmail, 
  sanitizeAlphanumeric,
  detectXSS,
  detectSQLInjection,
  detectPathTraversal,
  detectCommandInjection,
  validateInput,
  securityMiddleware
} from '../../middleware/security.js';

describe('Security Middleware', () => {
  describe('Input Sanitization', () => {
    it('should sanitize XSS attempts', () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        '<iframe src="javascript:alert(1)"></iframe>',
        '<img onerror="alert(1)" src="x">',
        'javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>'
      ];

      maliciousInputs.forEach(input => {
        const sanitized = sanitizeString(input);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('vbscript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('data:text/html');
      });
    });

    it('should sanitize email inputs', () => {
      const inputs = [
        'TEST@EXAMPLE.COM',
        'user+tag@domain.co.uk',
        'user@domain.com<script>',
        'user@domain.com"onclick="alert(1)"'
      ];

      const expected = [
        'test@example.com',
        'user+tag@domain.co.uk',
        'user@domain.com',
        'user@domain.com'
      ];

      inputs.forEach((input, index) => {
        const sanitized = sanitizeEmail(input);
        expect(sanitized).toBe(expected[index]);
      });
    });

    it('should sanitize alphanumeric inputs', () => {
      const maliciousInputs = [
        'user123<script>',
        'user"onclick="alert(1)"',
        "user'; DROP TABLE users; --",
        'user`whoami`'
      ];

      maliciousInputs.forEach(input => {
        const sanitized = sanitizeAlphanumeric(input);
        expect(sanitized).toMatch(/^[a-zA-Z0-9\s._-]*$/);
        expect(sanitized).not.toContain('<script');
        expect(sanitized).not.toContain('onclick');
        expect(sanitized).not.toContain('DROP');
        expect(sanitized).not.toContain('`');
      });
    });
  });

  describe('Threat Detection', () => {
    it('should detect XSS attempts', () => {
      const xssAttempts = [
        '<script>alert("xss")</script>',
        '<img src="x" onerror="alert(1)">',
        'javascript:alert(1)',
        '<iframe src="javascript:void(0)">',
        '<meta http-equiv="refresh" content="0;url=javascript:alert(1)">'
      ];

      xssAttempts.forEach(attempt => {
        expect(detectXSS(attempt)).toBe(true);
      });

      const safeInputs = [
        'Hello world',
        'user@example.com',
        'This is a normal message',
        'Price: $19.99'
      ];

      safeInputs.forEach(input => {
        expect(detectXSS(input)).toBe(false);
      });
    });

    it('should detect SQL injection attempts', () => {
      const sqlInjections = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "UNION SELECT * FROM users",
        "1; DELETE FROM transactions",
        "admin'--",
        "1' UNION SELECT password FROM users WHERE id=1--"
      ];

      sqlInjections.forEach(injection => {
        expect(detectSQLInjection(injection)).toBe(true);
      });

      const safeInputs = [
        'normal text',
        'user@example.com',
        'Order #12345',
        'Amount: $100.00'
      ];

      safeInputs.forEach(input => {
        expect(detectSQLInjection(input)).toBe(false);
      });
    });

    it('should detect path traversal attempts', () => {
      const pathTraversals = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
        '....//....//....//etc/passwd'
      ];

      pathTraversals.forEach(traversal => {
        expect(detectPathTraversal(traversal)).toBe(true);
      });

      const safePaths = [
        '/api/users',
        'documents/file.pdf',
        'images/profile.jpg',
        'normal-filename.txt'
      ];

      safePaths.forEach(path => {
        expect(detectPathTraversal(path)).toBe(false);
      });
    });

    it('should detect command injection attempts', () => {
      const commandInjections = [
        'user; rm -rf /',
        'user && whoami',
        'user | cat /etc/passwd',
        'user`id`',
        'user$(whoami)',
        'eval("malicious code")'
      ];

      commandInjections.forEach(injection => {
        expect(detectCommandInjection(injection)).toBe(true);
      });

      const safeInputs = [
        'username',
        'normal text',
        'file.txt',
        'user@domain.com'
      ];

      safeInputs.forEach(input => {
        expect(detectCommandInjection(input)).toBe(false);
      });
    });
  });

  describe('Input Validation', () => {
    it('should validate and sanitize simple strings', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = validateInput(input);
      
      expect(result.isValid).toBe(false);
      expect(result.threats).toContain('XSS');
      expect(result.sanitized).not.toContain('<script');
      expect(result.sanitized).toContain('Hello World');
    });

    it('should validate complex objects', () => {
      const input = {
        name: 'John<script>alert(1)</script>',
        email: 'john@example.com',
        comment: "'; DROP TABLE users; --",
        nested: {
          value: 'normal text'
        }
      };

      const result = validateInput(input);
      
      expect(result.isValid).toBe(false);
      expect(result.threats).toContain('XSS');
      expect(result.threats).toContain('SQL_INJECTION');
      expect(result.sanitized.name).not.toContain('<script');
      expect(result.sanitized.email).toBe('john@example.com');
    });

    it('should pass safe inputs', () => {
      const safeInput = {
        name: 'John Doe',
        email: 'john@example.com',
        amount: 100,
        description: 'A normal transaction'
      };

      const result = validateInput(safeInput);
      
      expect(result.isValid).toBe(true);
      expect(result.threats).toHaveLength(0);
    });
  });

  describe('Security Middleware Integration', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();
      app.use(express.json());
    });

    it('should block malicious requests', async () => {
      app.use(securityMiddleware());
      app.post('/test', (req, res) => res.json({ ok: true }));

      const maliciousPayload = {
        name: '<script>alert("xss")</script>',
        comment: "'; DROP TABLE users; --"
      };

      const response = await request(app)
        .post('/test')
        .send(maliciousPayload)
        .expect(400);

      expect(response.body.ok).toBe(false);
      expect(response.body.error).toBe('Invalid input detected');
      expect(response.body.threats).toContain('XSS');
      expect(response.body.threats).toContain('SQL_INJECTION');
    });

    it('should allow safe requests', async () => {
      app.use(securityMiddleware());
      app.post('/test', (req, res) => res.json({ ok: true, data: req.body }));

      const safePayload = {
        name: 'John Doe',
        email: 'john@example.com',
        amount: 100
      };

      const response = await request(app)
        .post('/test')
        .send(safePayload)
        .expect(200);

      expect(response.body.ok).toBe(true);
    });

    it('should sanitize inputs when enabled', async () => {
      app.use(securityMiddleware({ sanitize: true, validateInput: false }));
      app.post('/test', (req, res) => res.json({ ok: true, data: req.body }));

      const inputWithHTML = {
        name: 'John<script>alert(1)</script> Doe',
        description: 'Normal text with <b>bold</b>'
      };

      const response = await request(app)
        .post('/test')
        .send(inputWithHTML)
        .expect(200);

      expect(response.body.data.name).not.toContain('<script');
      expect(response.body.data.name).toContain('John');
      expect(response.body.data.name).toContain('Doe');
    });

    it('should enforce rate limiting', async () => {
      app.use(securityMiddleware({ 
        rateLimit: { maxRequests: 2, windowMs: 60000 }
      }));
      app.get('/test', (req, res) => res.json({ ok: true }));

      // First request should succeed
      await request(app).get('/test').expect(200);
      
      // Second request should succeed
      await request(app).get('/test').expect(200);
      
      // Third request should be rate limited
      const response = await request(app).get('/test').expect(429);
      expect(response.body.error).toBe('Rate limit exceeded');
    });

    it('should add security headers', async () => {
      app.use(securityMiddleware());
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app).get('/test').expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });
  });
});
