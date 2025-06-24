import { UserLocation } from '../types/store';

export interface LocationCacheEntry {
  coordinates: UserLocation;
  timestamp: number;
  accuracy: number;
}

export interface LocationValidationResult {
  isValid: boolean;
  coordinates?: UserLocation;
  error?: string;
}

export class LocationService {
  private static readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  private static readonly HIGH_ACCURACY_THRESHOLD = 100; // meters
  private static readonly COORDINATE_PRECISION = 6; // decimal places
  private static locationCache = new Map<string, LocationCacheEntry>();
  private static watchId: number | null = null;
  private static currentLocation: UserLocation | null = null;

  /**
   * Get current location with caching and accuracy validation
   */
  static async getCurrentLocation(options?: {
    enableHighAccuracy?: boolean;
    timeout?: number;
    maximumAge?: number;
    forceRefresh?: boolean;
  }): Promise<UserLocation> {
    const cacheKey = 'current_location';
    const now = Date.now();
    
    // Check cache first unless force refresh is requested
    if (!options?.forceRefresh) {
      const cached = this.locationCache.get(cacheKey);
      if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
        console.log('Using cached location:', cached.coordinates);
        return cached.coordinates;
      }
    }

    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      const defaultOptions = {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: this.CACHE_DURATION,
        ...options
      };

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coordinates = this.normalizeCoordinates({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });

          // Cache the location with accuracy info
          this.locationCache.set(cacheKey, {
            coordinates,
            timestamp: now,
            accuracy: position.coords.accuracy || 0
          });

          this.currentLocation = coordinates;
          console.log('Location obtained:', coordinates, 'Accuracy:', position.coords.accuracy);
          resolve(coordinates);
        },
        (error) => {
          console.error('Geolocation error:', error);
          
          let errorMessage = 'Failed to get location';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location services.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.';
              break;
          }
          
          reject(new Error(errorMessage));
        },
        defaultOptions
      );
    });
  }

  /**
   * Start watching user location for real-time updates
   */
  static startLocationWatch(
    onLocationUpdate: (location: UserLocation) => void,
    onError?: (error: GeolocationPositionError) => void
  ): void {
    if (!navigator.geolocation) {
      onError?.(new GeolocationPositionError());
      return;
    }

    // Clear existing watch
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const coordinates = this.normalizeCoordinates({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });

        // Only update if location has changed significantly (>10 meters)
        if (this.currentLocation) {
          const distance = this.calculateDistance(
            this.currentLocation.lat,
            this.currentLocation.lng,
            coordinates.lat,
            coordinates.lng
          );
          
          if (distance < 0.01) { // Less than 10 meters
            return;
          }
        }

        this.currentLocation = coordinates;
        
        // Update cache
        this.locationCache.set('current_location', {
          coordinates,
          timestamp: Date.now(),
          accuracy: position.coords.accuracy || 0
        });

        onLocationUpdate(coordinates);
      },
      onError,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000 // 1 minute
      }
    );
  }

  /**
   * Stop watching user location
   */
  static stopLocationWatch(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /**
   * Validate and normalize coordinates to 6 decimal precision
   */
  static normalizeCoordinates(coordinates: UserLocation): UserLocation {
    const precision = Math.pow(10, this.COORDINATE_PRECISION);
    
    return {
      lat: Math.round(coordinates.lat * precision) / precision,
      lng: Math.round(coordinates.lng * precision) / precision
    };
  }

  /**
   * Validate coordinates are within valid ranges
   */
  static validateCoordinates(coordinates: UserLocation): LocationValidationResult {
    const { lat, lng } = coordinates;

    // Check latitude range (-90 to 90)
    if (lat < -90 || lat > 90) {
      return {
        isValid: false,
        error: `Invalid latitude: ${lat}. Must be between -90 and 90.`
      };
    }

    // Check longitude range (-180 to 180)
    if (lng < -180 || lng > 180) {
      return {
        isValid: false,
        error: `Invalid longitude: ${lng}. Must be between -180 and 180.`
      };
    }

    // Check for obviously invalid coordinates (0,0 unless specifically intended)
    if (lat === 0 && lng === 0) {
      return {
        isValid: false,
        error: 'Coordinates appear to be invalid (0,0).'
      };
    }

    return {
      isValid: true,
      coordinates: this.normalizeCoordinates(coordinates)
    };
  }

  /**
   * Calculate distance using Haversine formula with high precision
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371.0088; // Earth's radius in kilometers (more precise value)
    
    // Convert degrees to radians
    const lat1Rad = this.toRadians(lat1);
    const lat2Rad = this.toRadians(lat2);
    const deltaLatRad = this.toRadians(lat2 - lat1);
    const deltaLngRad = this.toRadians(lng2 - lng1);

    // Haversine formula
    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance = R * c;
    
    // Round to appropriate precision (3 decimal places = meter precision)
    return Math.round(distance * 1000) / 1000;
  }

  /**
   * Convert degrees to radians
   */
  private static toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Batch calculate distances for multiple stores
   */
  static calculateDistancesForStores<T extends { lat?: number; lng?: number }>(
    stores: T[],
    userLocation: UserLocation
  ): (T & { distance?: number })[] {
    return stores.map(store => {
      if (!store.lat || !store.lng) {
        return { ...store, distance: undefined };
      }

      const distance = this.calculateDistance(
        userLocation.lat,
        userLocation.lng,
        store.lat,
        store.lng
      );

      return { ...store, distance };
    });
  }

  /**
   * Clear location cache
   */
  static clearCache(): void {
    this.locationCache.clear();
    console.log('Location cache cleared');
  }

  /**
   * Get cache statistics
   */
  static getCacheStats(): {
    size: number;
    entries: Array<{ key: string; age: number; accuracy: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.locationCache.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.timestamp,
      accuracy: entry.accuracy
    }));

    return {
      size: this.locationCache.size,
      entries
    };
  }

  /**
   * Preload location for better performance
   */
  static async preloadLocation(): Promise<void> {
    try {
      await this.getCurrentLocation({
        enableHighAccuracy: false, // Use less accurate but faster method for preload
        timeout: 10000,
        maximumAge: this.CACHE_DURATION
      });
      console.log('Location preloaded successfully');
    } catch (error) {
      console.warn('Location preload failed:', error);
      // Don't throw error for preload failures
    }
  }
}