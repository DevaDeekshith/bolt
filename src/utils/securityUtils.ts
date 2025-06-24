/**
 * Security utilities for safe URL handling and CORS management
 */

export interface CSPConfig {
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  frameSrc: string[];
  fontSrc: string[];
}

export class SecurityUtils {
  private static readonly ALLOWED_DOMAINS = [
    'maps.google.com',
    'maps.googleapis.com',
    'accounts.google.com',
    'api.olamaps.io',
    'gudgumstorelocator.vercel.app',
    'localhost:5173',
    'localhost:3000'
  ];

  private static readonly DANGEROUS_PROTOCOLS = [
    'javascript:',
    'data:',
    'vbscript:',
    'file:',
    'ftp:'
  ];

  /**
   * Sanitize URL to prevent XSS and injection attacks
   */
  static sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    // Remove any dangerous protocols
    const lowerUrl = url.toLowerCase().trim();
    for (const protocol of this.DANGEROUS_PROTOCOLS) {
      if (lowerUrl.startsWith(protocol)) {
        console.warn('Dangerous protocol detected and removed:', protocol);
        return '';
      }
    }

    // Ensure URL starts with http:// or https://
    if (!lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://')) {
      // If it looks like a domain, add https://
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        return '';
      }
    }

    try {
      const urlObj = new URL(url);
      
      // Check if domain is allowed
      const isAllowed = this.ALLOWED_DOMAINS.some(domain => 
        urlObj.hostname === domain || urlObj.hostname.endsWith('.' + domain)
      );

      if (!isAllowed) {
        console.warn('Domain not in allowed list:', urlObj.hostname);
        return '';
      }

      return urlObj.toString();
    } catch (error) {
      console.error('Invalid URL:', url, error);
      return '';
    }
  }

  /**
   * Sanitize location parameters for map URLs
   */
  static sanitizeLocationParams(params: {
    lat?: number;
    lng?: number;
    name?: string;
    address?: string;
  }): {
    lat?: number;
    lng?: number;
    name?: string;
    address?: string;
  } {
    const sanitized: typeof params = {};

    // Validate and sanitize coordinates
    if (typeof params.lat === 'number' && isFinite(params.lat)) {
      sanitized.lat = Math.max(-90, Math.min(90, params.lat));
    }

    if (typeof params.lng === 'number' && isFinite(params.lng)) {
      sanitized.lng = Math.max(-180, Math.min(180, params.lng));
    }

    // Sanitize text fields
    if (params.name && typeof params.name === 'string') {
      sanitized.name = this.sanitizeText(params.name, 100);
    }

    if (params.address && typeof params.address === 'string') {
      sanitized.address = this.sanitizeText(params.address, 200);
    }

    return sanitized;
  }

  /**
   * Sanitize text input to prevent XSS
   */
  static sanitizeText(text: string, maxLength: number = 255): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/[<>\"'&]/g, '') // Remove HTML/XML special characters
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .trim()
      .substring(0, maxLength);
  }

  /**
   * Generate Content Security Policy headers
   */
  static generateCSPHeaders(): CSPConfig {
    return {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // Required for some map libraries
        "maps.googleapis.com",
        "maps.google.com",
        "api.olamaps.io"
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'", // Required for dynamic styles
        "fonts.googleapis.com",
        "maps.googleapis.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "blob:",
        "maps.googleapis.com",
        "maps.gstatic.com",
        "api.olamaps.io",
        "*.tile.openstreetmap.org"
      ],
      connectSrc: [
        "'self'",
        "maps.googleapis.com",
        "api.olamaps.io",
        "accounts.google.com"
      ],
      frameSrc: [
        "'self'",
        "maps.google.com",
        "www.google.com"
      ],
      fontSrc: [
        "'self'",
        "fonts.googleapis.com",
        "fonts.gstatic.com"
      ]
    };
  }

  /**
   * Format CSP header string
   */
  static formatCSPHeader(config: CSPConfig): string {
    const directives = Object.entries(config).map(([key, values]) => {
      const directiveName = key.replace(/([A-Z])/g, '-$1').toLowerCase();
      return `${directiveName} ${values.join(' ')}`;
    });

    return directives.join('; ');
  }

  /**
   * Validate CORS origin
   */
  static isValidCORSOrigin(origin: string): boolean {
    if (!origin) return false;

    try {
      const url = new URL(origin);
      return this.ALLOWED_DOMAINS.some(domain => 
        url.hostname === domain || url.hostname.endsWith('.' + domain)
      );
    } catch {
      return false;
    }
  }

  /**
   * Generate CORS headers for API responses
   */
  static generateCORSHeaders(requestOrigin?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400' // 24 hours
    };

    // Only set specific origin if it's valid, otherwise use wildcard for public APIs
    if (requestOrigin && this.isValidCORSOrigin(requestOrigin)) {
      headers['Access-Control-Allow-Origin'] = requestOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    } else {
      headers['Access-Control-Allow-Origin'] = '*';
    }

    return headers;
  }

  /**
   * Validate API key format (basic validation)
   */
  static validateAPIKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Basic format validation - adjust based on your API key format
    const apiKeyPattern = /^[A-Za-z0-9_-]{20,}$/;
    return apiKeyPattern.test(apiKey);
  }

  /**
   * Rate limiting check
   */
  static checkRateLimit(
    identifier: string,
    maxRequests: number,
    windowMs: number,
    storage: Map<string, number[]> = new Map()
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Get existing requests for this identifier
    const requests = storage.get(identifier) || [];
    
    // Filter out requests outside the current window
    const validRequests = requests.filter(time => time > windowStart);
    
    // Check if limit is exceeded
    const allowed = validRequests.length < maxRequests;
    const remaining = Math.max(0, maxRequests - validRequests.length);
    const resetTime = windowStart + windowMs;
    
    if (allowed) {
      // Add current request
      validRequests.push(now);
      storage.set(identifier, validRequests);
    }
    
    return { allowed, remaining, resetTime };
  }

  /**
   * Generate secure random string for request IDs
   */
  static generateSecureId(length: number = 16): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    
    if (crypto && crypto.getRandomValues) {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      
      for (let i = 0; i < length; i++) {
        result += chars[array[i] % chars.length];
      }
    } else {
      // Fallback for environments without crypto.getRandomValues
      for (let i = 0; i < length; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
      }
    }
    
    return result;
  }

  /**
   * Validate and sanitize search query
   */
  static sanitizeSearchQuery(query: string): string {
    if (!query || typeof query !== 'string') {
      return '';
    }

    return query
      .replace(/[<>\"'&]/g, '') // Remove HTML special characters
      .replace(/[^\w\s\-.,#]/g, '') // Keep only word characters, spaces, and basic punctuation
      .trim()
      .substring(0, 100); // Limit length
  }

  /**
   * Log security events for monitoring
   */
  static logSecurityEvent(event: {
    type: 'invalid_url' | 'cors_violation' | 'rate_limit_exceeded' | 'invalid_input';
    details: string;
    userAgent?: string;
    ip?: string;
    timestamp?: number;
  }): void {
    const logEntry = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      userAgent: event.userAgent || navigator.userAgent
    };

    console.warn('Security Event:', logEntry);
    
    // In production, you might want to send this to a security monitoring service
    // Example: sendToSecurityMonitoring(logEntry);
  }
}