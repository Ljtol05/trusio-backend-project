
import { z } from 'zod';
import { logger } from '../../lib/logger.js';
import { AGENT_CONFIG } from '../config.js';

// Input validation schemas
export const AgentInputSchema = z.object({
  message: z.string()
    .min(1, 'Message cannot be empty')
    .max(AGENT_CONFIG.maxInputLength, `Message too long (max ${AGENT_CONFIG.maxInputLength} characters)`),
  agentName: z.string().optional(),
  sessionId: z.string().optional(),
  context: z.record(z.unknown()).optional(),
});

export const AgentOutputSchema = z.object({
  response: z.string()
    .min(1, 'Response cannot be empty')
    .max(AGENT_CONFIG.maxOutputLength, `Response too long (max ${AGENT_CONFIG.maxOutputLength} characters)`),
  agentName: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

// Security validation patterns
const SECURITY_PATTERNS = {
  // Patterns that might indicate attempts to manipulate the agent
  promptInjection: [
    /ignore\s+previous\s+instructions/i,
    /forget\s+everything/i,
    /you\s+are\s+now/i,
    /system\s*:\s*/i,
    /\[SYSTEM\]/i,
    /\{SYSTEM\}/i,
    /<system>/i,
  ],
  
  // Patterns that might indicate attempts to extract sensitive information
  informationExtraction: [
    /api\s+key/i,
    /password/i,
    /secret/i,
    /token/i,
    /credential/i,
    /database/i,
    /sql/i,
    /admin/i,
  ],
  
  // Patterns that might indicate malicious content
  maliciousContent: [
    /<script/i,
    /javascript:/i,
    /data:text\/html/i,
    /vbscript:/i,
    /on\w+\s*=/i,
  ],
};

export class AgentValidator {
  /**
   * Validate agent input for security and format
   */
  validateInput(input: unknown): { isValid: boolean; data?: any; errors?: string[] } {
    try {
      // Schema validation
      const validatedInput = AgentInputSchema.parse(input);
      
      // Security validation
      const securityErrors = this.checkInputSecurity(validatedInput.message);
      if (securityErrors.length > 0) {
        logger.warn({ 
          securityErrors,
          messageLength: validatedInput.message.length 
        }, 'Input failed security validation');
        
        return {
          isValid: false,
          errors: securityErrors
        };
      }
      
      logger.debug('Input validation passed');
      return {
        isValid: true,
        data: validatedInput
      };
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        logger.warn({ errors }, 'Input validation failed');
        return {
          isValid: false,
          errors
        };
      }
      
      logger.error({ error }, 'Unexpected error during input validation');
      return {
        isValid: false,
        errors: ['Invalid input format']
      };
    }
  }

  /**
   * Validate agent output for security and format
   */
  validateOutput(output: unknown): { isValid: boolean; data?: any; errors?: string[] } {
    try {
      // Schema validation
      const validatedOutput = AgentOutputSchema.parse(output);
      
      // Security validation  
      const securityErrors = this.checkOutputSecurity(validatedOutput.response);
      if (securityErrors.length > 0) {
        logger.warn({ 
          securityErrors,
          agentName: validatedOutput.agentName,
          responseLength: validatedOutput.response.length 
        }, 'Output failed security validation');
        
        return {
          isValid: false,
          errors: securityErrors
        };
      }
      
      logger.debug({ agentName: validatedOutput.agentName }, 'Output validation passed');
      return {
        isValid: true,
        data: validatedOutput
      };
      
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
        logger.warn({ errors }, 'Output validation failed');
        return {
          isValid: false,
          errors
        };
      }
      
      logger.error({ error }, 'Unexpected error during output validation');
      return {
        isValid: false,
        errors: ['Invalid output format']
      };
    }
  }

  /**
   * Check input for security issues
   */
  private checkInputSecurity(message: string): string[] {
    const errors: string[] = [];
    
    // Check for prompt injection attempts
    for (const pattern of SECURITY_PATTERNS.promptInjection) {
      if (pattern.test(message)) {
        errors.push('Potential prompt injection detected');
        break;
      }
    }
    
    // Check for information extraction attempts
    for (const pattern of SECURITY_PATTERNS.informationExtraction) {
      if (pattern.test(message)) {
        errors.push('Potential information extraction attempt detected');
        break;
      }
    }
    
    // Check for malicious content
    for (const pattern of SECURITY_PATTERNS.maliciousContent) {
      if (pattern.test(message)) {
        errors.push('Potentially malicious content detected');
        break;
      }
    }
    
    return errors;
  }

  /**
   * Check output for security issues
   */
  private checkOutputSecurity(response: string): string[] {
    const errors: string[] = [];
    
    // Check for malicious content in output
    for (const pattern of SECURITY_PATTERNS.maliciousContent) {
      if (pattern.test(response)) {
        errors.push('Potentially malicious content in response');
        break;
      }
    }
    
    // Check for potential information leakage
    const sensitivePatterns = [
      /sk-[a-zA-Z0-9]{20,}/,  // OpenAI API key pattern
      /[\w\.-]+@[\w\.-]+\.\w+/g, // Email addresses
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN pattern
      /\b\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\b/, // Credit card pattern
    ];
    
    for (const pattern of sensitivePatterns) {
      if (pattern.test(response)) {
        errors.push('Potential sensitive information in response');
        break;
      }
    }
    
    return errors;
  }

  /**
   * Sanitize user input
   */
  sanitizeInput(input: string): string {
    // Remove potentially dangerous characters and patterns
    return input
      .replace(/<script.*?<\/script>/gi, '')
      .replace(/<.*?>/g, '') // Remove HTML tags
      .replace(/javascript:/gi, '')
      .replace(/vbscript:/gi, '')
      .replace(/data:text\/html/gi, '')
      .trim();
  }

  /**
   * Rate limiting validation
   */
  validateRateLimit(userId: string, agentName: string): { allowed: boolean; resetTime?: Date } {
    // This could be implemented with Redis or in-memory store
    // For now, return always allowed
    return { allowed: true };
  }

  /**
   * Validate agent permissions for user
   */
  validateAgentPermissions(userId: string, agentName: string): boolean {
    // All authenticated users can access all agents for now
    // This could be expanded for role-based access
    return true;
  }
}

// Export singleton instance
export const agentValidator = new AgentValidator();
