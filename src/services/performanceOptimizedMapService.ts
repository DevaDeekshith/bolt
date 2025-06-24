import { Store, GeocodeResponse, DirectionsResponse, UserLocation } from '../types/store';
import { LocationService } from './locationService';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

export interface APIUsageStats {
  geocodingCalls: number;
  directionsCalls: number;
  lastReset: number;
  dailyLimit: number;
  remainingCalls: number;
}

export class PerformanceOptimizedMapService {
  private static readonly API_KEY = 'cgDoFOA0AybOu0oZZm4yaG9mvf85rQlqwMNS6F7h';
  private static readonly BASE_URL = 'https://api.olamaps.io';
  
  // Cache configuration
  private static readonly GEOCODE_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly DIRECTIONS_CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
  private static readonly MAX_CACHE_SIZE = 1000;
  
  // Rate limiting
  private static readonly DAILY_API_LIMIT = 10000;
  private static readonly RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
  private static readonly MAX_REQUESTS_PER_WINDOW = 100;
  
  // Caches
  private static geocodeCache = new Map<string, CacheEntry<{ lat: number; lng: number } | null>>();
  private static directionsCache = new Map<string, CacheEntry<DirectionsResponse | null>>();
  private static requestQueue: Array<() => Promise<any>> = [];
  private static isProcessingQueue = false;
  
  // API usage tracking
  private static apiUsage: APIUsageStats = {
    geocodingCalls: 0,
    directionsCalls: 0,
    lastReset: Date.now(),
    dailyLimit: this.DAILY_API_LIMIT,
    remainingCalls: this.DAILY_API_LIMIT
  };

  // Request tracking for rate limiting
  private static requestTimestamps: number[] = [];

  /**
   * Initialize the service with preloading
   */
  static async initialize(): Promise<void> {
    console.log('Initializing PerformanceOptimizedMapService...');
    
    // Clean up old cache entries
    this.cleanupCache();
    
    // Reset daily usage if needed
    this.resetDailyUsageIfNeeded();
    
    // Preload common locations
    await this.preloadCommonLocations();
    
    console.log('PerformanceOptimizedMapService initialized');
  }

  /**
   * Geocode address with caching and rate limiting
   */
  static async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!address?.trim()) {
      return null;
    }

    const cacheKey = this.sanitizeAddress(address).toLowerCase();
    
    // Check cache first
    const cached = this.geocodeCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log('Using cached geocoding result for:', address);
      return cached.data;
    }

    // Check rate limits
    if (!this.canMakeRequest()) {
      console.warn('Rate limit exceeded, using fallback geocoding');
      return this.fallbackGeocode(address);
    }

    // Queue the request to avoid overwhelming the API
    return this.queueRequest(async () => {
      try {
        const result = await this.performGeocodingRequest(address);
        
        // Cache the result
        this.geocodeCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.GEOCODE_CACHE_DURATION
        });

        // Update API usage
        this.apiUsage.geocodingCalls++;
        this.apiUsage.remainingCalls--;
        
        return result;
      } catch (error) {
        console.error('Geocoding API error:', error);
        
        // Return fallback result
        const fallback = this.fallbackGeocode(address);
        
        // Cache fallback result with shorter duration
        this.geocodeCache.set(cacheKey, {
          data: fallback,
          timestamp: Date.now(),
          expiresAt: Date.now() + (60 * 60 * 1000) // 1 hour for fallback
        });
        
        return fallback;
      }
    });
  }

  /**
   * Get directions with caching and optimization
   */
  static async getDirections(
    origin: UserLocation,
    destination: { lat: number; lng: number }
  ): Promise<DirectionsResponse | null> {
    const cacheKey = `${origin.lat},${origin.lng}-${destination.lat},${destination.lng}`;
    
    // Check cache first
    const cached = this.directionsCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      console.log('Using cached directions result');
      return cached.data;
    }

    // Check rate limits
    if (!this.canMakeRequest()) {
      console.warn('Rate limit exceeded, using fallback directions');
      return this.createFallbackDirections(origin, destination);
    }

    return this.queueRequest(async () => {
      try {
        const result = await this.performDirectionsRequest(origin, destination);
        
        // Cache the result
        this.directionsCache.set(cacheKey, {
          data: result,
          timestamp: Date.now(),
          expiresAt: Date.now() + this.DIRECTIONS_CACHE_DURATION
        });

        // Update API usage
        this.apiUsage.directionsCalls++;
        this.apiUsage.remainingCalls--;
        
        return result;
      } catch (error) {
        console.error('Directions API error:', error);
        
        // Return fallback result
        const fallback = this.createFallbackDirections(origin, destination);
        
        // Cache fallback result with shorter duration
        this.directionsCache.set(cacheKey, {
          data: fallback,
          timestamp: Date.now(),
          expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes for fallback
        });
        
        return fallback;
      }
    });
  }

  /**
   * Batch geocode multiple addresses efficiently
   */
  static async batchGeocodeAddresses(addresses: string[]): Promise<Array<{ address: string; coordinates: { lat: number; lng: number } | null }>> {
    const results: Array<{ address: string; coordinates: { lat: number; lng: number } | null }> = [];
    
    // Process in batches to avoid overwhelming the API
    const batchSize = 5;
    for (let i = 0; i < addresses.length; i += batchSize) {
      const batch = addresses.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (address) => {
        const coordinates = await this.geocodeAddress(address);
        return { address, coordinates };
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Add delay between batches to respect rate limits
      if (i + batchSize < addresses.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }
    
    return results;
  }

  /**
   * Calculate distance using cached coordinates
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    return LocationService.calculateDistance(lat1, lng1, lat2, lng2);
  }

  /**
   * Preload common locations for better performance
   */
  private static async preloadCommonLocations(): Promise<void> {
    const commonLocations = [
      'Bangalore, Karnataka, India',
      'Mumbai, Maharashtra, India',
      'Delhi, India',
      'Chennai, Tamil Nadu, India',
      'Kolkata, West Bengal, India',
      'Hyderabad, Telangana, India',
      'Pune, Maharashtra, India'
    ];

    console.log('Preloading common locations...');
    
    // Preload in background without blocking
    setTimeout(async () => {
      for (const location of commonLocations) {
        try {
          await this.geocodeAddress(location);
          // Small delay between preload requests
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.warn('Failed to preload location:', location, error);
        }
      }
      console.log('Common locations preloaded');
    }, 1000);
  }

  /**
   * Perform actual geocoding API request
   */
  private static async performGeocodingRequest(address: string): Promise<{ lat: number; lng: number } | null> {
    const sanitizedAddress = this.sanitizeAddress(address);
    
    const response = await fetch(
      `${this.BASE_URL}/places/v1/geocode?address=${encodeURIComponent(sanitizedAddress)}&api_key=${this.API_KEY}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': 'GudGumStoreLocator/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Geocoding API error: ${response.status} ${response.statusText}`);
    }

    const data: GeocodeResponse = await response.json();
    
    if (data.geocodingResults && data.geocodingResults.length > 0) {
      const location = data.geocodingResults[0].geometry.location;
      return LocationService.normalizeCoordinates({ lat: location.lat, lng: location.lng });
    }

    return null;
  }

  /**
   * Perform actual directions API request
   */
  private static async performDirectionsRequest(
    origin: UserLocation,
    destination: { lat: number; lng: number }
  ): Promise<DirectionsResponse | null> {
    const url = new URL(`${this.BASE_URL}/routing/v1/directions`);
    url.searchParams.append('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.append('destination', `${destination.lat},${destination.lng}`);
    url.searchParams.append('api_key', this.API_KEY);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'X-Request-Id': `directions-${Date.now()}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'GudGumStoreLocator/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Directions API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Queue requests to avoid overwhelming the API
   */
  private static async queueRequest<T>(requestFn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue();
    });
  }

  /**
   * Process the request queue with rate limiting
   */
  private static async processQueue(): Promise<void> {
    if (this.isProcessingQueue || this.requestQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0 && this.canMakeRequest()) {
      const request = this.requestQueue.shift();
      if (request) {
        try {
          await request();
          this.recordRequest();
          
          // Small delay between requests
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error('Queued request failed:', error);
        }
      }
    }

    this.isProcessingQueue = false;
  }

  /**
   * Check if we can make a request based on rate limits
   */
  private static canMakeRequest(): boolean {
    const now = Date.now();
    
    // Check daily limit
    if (this.apiUsage.remainingCalls <= 0) {
      return false;
    }

    // Check rate limit window
    this.requestTimestamps = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.RATE_LIMIT_WINDOW
    );

    return this.requestTimestamps.length < this.MAX_REQUESTS_PER_WINDOW;
  }

  /**
   * Record a request for rate limiting
   */
  private static recordRequest(): void {
    this.requestTimestamps.push(Date.now());
  }

  /**
   * Reset daily usage if needed
   */
  private static resetDailyUsageIfNeeded(): void {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    if (this.apiUsage.lastReset < oneDayAgo) {
      this.apiUsage.geocodingCalls = 0;
      this.apiUsage.directionsCalls = 0;
      this.apiUsage.remainingCalls = this.DAILY_API_LIMIT;
      this.apiUsage.lastReset = now;
      console.log('Daily API usage reset');
    }
  }

  /**
   * Clean up old cache entries
   */
  private static cleanupCache(): void {
    const now = Date.now();
    
    // Clean geocode cache
    for (const [key, entry] of this.geocodeCache.entries()) {
      if (now > entry.expiresAt) {
        this.geocodeCache.delete(key);
      }
    }

    // Clean directions cache
    for (const [key, entry] of this.directionsCache.entries()) {
      if (now > entry.expiresAt) {
        this.directionsCache.delete(key);
      }
    }

    // Limit cache size
    if (this.geocodeCache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.geocodeCache.entries());
      entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toDelete = entries.slice(0, entries.length - this.MAX_CACHE_SIZE);
      toDelete.forEach(([key]) => this.geocodeCache.delete(key));
    }

    console.log(`Cache cleanup completed. Geocode cache: ${this.geocodeCache.size}, Directions cache: ${this.directionsCache.size}`);
  }

  /**
   * Sanitize address for API calls
   */
  private static sanitizeAddress(address: string): string {
    return address
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\x00-\x7F]/g, '')
      .replace(/[^a-zA-Z0-9\s\-.,#]/g, '')
      .trim()
      .replace(/\s+/g, ' ');
  }

  /**
   * Enhanced fallback geocoding with more locations
   */
  private static fallbackGeocode(address: string): { lat: number; lng: number } | null {
    const locationCoordinates: { [key: string]: { lat: number; lng: number } } = {
      // Major cities with precise coordinates
      'bangalore': { lat: 12.971599, lng: 77.594566 },
      'bengaluru': { lat: 12.971599, lng: 77.594566 },
      'mumbai': { lat: 19.076090, lng: 72.877426 },
      'delhi': { lat: 28.704060, lng: 77.102493 },
      'new delhi': { lat: 28.613939, lng: 77.209021 },
      'chennai': { lat: 13.082680, lng: 80.270721 },
      'kolkata': { lat: 22.572646, lng: 88.363895 },
      'hyderabad': { lat: 17.385044, lng: 78.486671 },
      'pune': { lat: 18.520430, lng: 73.856743 },
      'ahmedabad': { lat: 23.022505, lng: 72.571362 },
      'jaipur': { lat: 26.912434, lng: 75.787270 },
      'surat': { lat: 21.170240, lng: 72.831061 },
      'lucknow': { lat: 26.846694, lng: 80.946166 },
      'kanpur': { lat: 26.449923, lng: 80.331871 },
      'nagpur': { lat: 21.145800, lng: 79.088158 },
      'indore': { lat: 22.719568, lng: 75.857727 },
      'thane': { lat: 19.218330, lng: 72.978088 },
      'bhopal': { lat: 23.259933, lng: 77.412615 },
      'visakhapatnam': { lat: 17.686816, lng: 83.218482 },
      'pimpri': { lat: 18.629834, lng: 73.799713 },
      'patna': { lat: 25.594095, lng: 85.137566 },
      'vadodara': { lat: 22.307159, lng: 73.181219 },
      'ghaziabad': { lat: 28.669155, lng: 77.453758 },
      'ludhiana': { lat: 30.900965, lng: 75.857277 },
      'agra': { lat: 27.176670, lng: 78.008072 },
      'nashik': { lat: 19.997454, lng: 73.789803 },
      'faridabad': { lat: 28.408389, lng: 77.317429 },
      'meerut': { lat: 28.984644, lng: 77.706414 },
      'rajkot': { lat: 22.308155, lng: 70.800705 },
      'kalyan': { lat: 19.243169, lng: 73.129394 },
      
      // Bangalore specific areas with precise coordinates
      'koramangala': { lat: 12.935242, lng: 77.624480 },
      'indiranagar': { lat: 12.971891, lng: 77.641213 },
      'whitefield': { lat: 12.969808, lng: 77.750122 },
      'electronic city': { lat: 12.845648, lng: 77.660324 },
      'btm layout': { lat: 12.916500, lng: 77.610100 },
      'hsr layout': { lat: 12.911606, lng: 77.637043 },
      'marathahalli': { lat: 12.959065, lng: 77.697395 },
      'hebbal': { lat: 13.035820, lng: 77.597023 },
      'yelahanka': { lat: 13.100700, lng: 77.596344 },
      'banashankari': { lat: 12.924915, lng: 77.565742 },
      'jayanagar': { lat: 12.927923, lng: 77.593742 },
      'malleshwaram': { lat: 13.003056, lng: 77.581108 },
      'rajajinagar': { lat: 12.991545, lng: 77.552017 },
      'basaveshwaranagar': { lat: 12.978394, lng: 77.540836 },
      'vijayanagar': { lat: 12.963440, lng: 77.585548 },
      'jp nagar': { lat: 12.908131, lng: 77.583115 },
      'rt nagar': { lat: 13.019886, lng: 77.595520 },
      'sadashivanagar': { lat: 13.006735, lng: 77.580414 },
      'seshadripuram': { lat: 12.989012, lng: 77.570664 }
    };

    const addressLower = address.toLowerCase();
    
    // Try exact matches first
    for (const [location, coords] of Object.entries(locationCoordinates)) {
      if (addressLower === location || addressLower.includes(location)) {
        console.log(`Using fallback coordinates for ${location}:`, coords);
        return LocationService.normalizeCoordinates({
          lat: coords.lat + (Math.random() - 0.5) * 0.001, // Small random offset
          lng: coords.lng + (Math.random() - 0.5) * 0.001
        });
      }
    }

    // Try partial matches
    for (const [location, coords] of Object.entries(locationCoordinates)) {
      const locationWords = location.split(' ');
      if (locationWords.some(word => addressLower.includes(word) && word.length > 3)) {
        console.log(`Using partial match fallback coordinates for ${location}:`, coords);
        return LocationService.normalizeCoordinates({
          lat: coords.lat + (Math.random() - 0.5) * 0.01,
          lng: coords.lng + (Math.random() - 0.5) * 0.01
        });
      }
    }

    // Default to Bangalore with random offset
    console.log('Using default Bangalore coordinates for address:', address);
    return LocationService.normalizeCoordinates({
      lat: 12.971599 + (Math.random() - 0.5) * 0.1,
      lng: 77.594566 + (Math.random() - 0.5) * 0.1
    });
  }

  /**
   * Create fallback directions response
   */
  private static createFallbackDirections(
    origin: UserLocation,
    destination: { lat: number; lng: number }
  ): DirectionsResponse {
    const distance = this.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
    
    return {
      routes: [{
        geometry: {
          coordinates: [
            [origin.lng, origin.lat],
            [destination.lng, destination.lat]
          ]
        },
        legs: [{
          distance: {
            text: `${distance.toFixed(1)} km`,
            value: distance * 1000
          },
          duration: {
            text: `${Math.round(distance * 2)} min`, // Rough estimate: 2 min per km
            value: Math.round(distance * 2) * 60
          }
        }]
      }]
    };
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    geocodeCache: { size: number; hitRate: number };
    directionsCache: { size: number; hitRate: number };
    apiUsage: APIUsageStats;
    queueSize: number;
  } {
    return {
      geocodeCache: {
        size: this.geocodeCache.size,
        hitRate: 0 // Would need to track hits vs misses for accurate calculation
      },
      directionsCache: {
        size: this.directionsCache.size,
        hitRate: 0
      },
      apiUsage: { ...this.apiUsage },
      queueSize: this.requestQueue.length
    };
  }

  /**
   * Clear all caches
   */
  static clearAllCaches(): void {
    this.geocodeCache.clear();
    this.directionsCache.clear();
    console.log('All caches cleared');
  }

  /**
   * Warm up the service with common operations
   */
  static async warmUp(): Promise<void> {
    console.log('Warming up PerformanceOptimizedMapService...');
    
    try {
      // Initialize location service
      await LocationService.preloadLocation();
      
      // Initialize this service
      await this.initialize();
      
      console.log('Service warm-up completed');
    } catch (error) {
      console.warn('Service warm-up failed:', error);
    }
  }
}