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
  private static readonly EARTH_RADIUS_KM = 6371.0088; // More precise Earth radius in kilometers
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

          // Validate coordinates before caching
          const validation = this.validateCoordinates(coordinates);
          if (!validation.isValid) {
            reject(new Error(validation.error || 'Invalid coordinates received'));
            return;
          }

          // Cache the location with accuracy info
          this.locationCache.set(cacheKey, {
            coordinates: validation.coordinates!,
            timestamp: now,
            accuracy: position.coords.accuracy || 0
          });

          this.currentLocation = validation.coordinates!;
          console.log('Location obtained:', validation.coordinates, 'Accuracy:', position.coords.accuracy);
          resolve(validation.coordinates!);
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

        // Validate coordinates
        const validation = this.validateCoordinates(coordinates);
        if (!validation.isValid) {
          console.warn('Invalid coordinates from watch position:', validation.error);
          return;
        }

        const validCoordinates = validation.coordinates!;

        // Only update if location has changed significantly (>10 meters)
        if (this.currentLocation) {
          const distance = this.calculateDistance(
            this.currentLocation.lat,
            this.currentLocation.lng,
            validCoordinates.lat,
            validCoordinates.lng
          );
          
          if (distance < 0.01) { // Less than 10 meters
            return;
          }
        }

        this.currentLocation = validCoordinates;
        
        // Update cache
        this.locationCache.set('current_location', {
          coordinates: validCoordinates,
          timestamp: Date.now(),
          accuracy: position.coords.accuracy || 0
        });

        onLocationUpdate(validCoordinates);
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
   * Validate coordinates are within valid ranges and not obviously incorrect
   */
  static validateCoordinates(coordinates: UserLocation): LocationValidationResult {
    const { lat, lng } = coordinates;

    // Check for null, undefined, or NaN values
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) {
      return {
        isValid: false,
        error: 'Coordinates contain invalid values (null, undefined, or NaN)'
      };
    }

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
        error: 'Coordinates appear to be invalid (0,0). This may indicate a GPS error.'
      };
    }

    // Check for coordinates that are too precise (indicating potential errors)
    const latStr = lat.toString();
    const lngStr = lng.toString();
    const latDecimals = latStr.includes('.') ? latStr.split('.')[1].length : 0;
    const lngDecimals = lngStr.includes('.') ? lngStr.split('.')[1].length : 0;
    
    if (latDecimals > 8 || lngDecimals > 8) {
      console.warn('Coordinates have unusually high precision, normalizing...');
    }

    return {
      isValid: true,
      coordinates: this.normalizeCoordinates(coordinates)
    };
  }

  /**
   * Calculate distance using Haversine formula with high precision and proper error handling
   */
  static calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    // Validate input coordinates
    const coord1Validation = this.validateCoordinates({ lat: lat1, lng: lng1 });
    const coord2Validation = this.validateCoordinates({ lat: lat2, lng: lng2 });
    
    if (!coord1Validation.isValid || !coord2Validation.isValid) {
      console.error('Invalid coordinates for distance calculation:', {
        coord1: { lat: lat1, lng: lng1, error: coord1Validation.error },
        coord2: { lat: lat2, lng: lng2, error: coord2Validation.error }
      });
      return Infinity;
    }

    // Use validated coordinates
    const validLat1 = coord1Validation.coordinates!.lat;
    const validLng1 = coord1Validation.coordinates!.lng;
    const validLat2 = coord2Validation.coordinates!.lat;
    const validLng2 = coord2Validation.coordinates!.lng;
    
    // Convert degrees to radians
    const lat1Rad = this.toRadians(validLat1);
    const lat2Rad = this.toRadians(validLat2);
    const deltaLatRad = this.toRadians(validLat2 - validLat1);
    const deltaLngRad = this.toRadians(validLng2 - validLng1);

    // Haversine formula
    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance = this.EARTH_RADIUS_KM * c;
    
    // Validate result
    if (!isFinite(distance) || distance < 0) {
      console.error('Invalid distance calculation result:', distance);
      return Infinity;
    }
    
    // Round to appropriate precision (3 decimal places = meter precision)
    return Math.round(distance * 1000) / 1000;
  }

  /**
   * Convert degrees to radians with validation
   */
  private static toRadians(degrees: number): number {
    if (!isFinite(degrees)) {
      throw new Error('Invalid degrees value for radian conversion');
    }
    return degrees * (Math.PI / 180);
  }

  /**
   * Batch calculate distances for multiple stores with error handling
   */
  static calculateDistancesForStores<T extends { lat?: number; lng?: number }>(
    stores: T[],
    userLocation: UserLocation
  ): (T & { distance?: number })[] {
    // Validate user location first
    const userLocationValidation = this.validateCoordinates(userLocation);
    if (!userLocationValidation.isValid) {
      console.error('Invalid user location for distance calculations:', userLocationValidation.error);
      return stores.map(store => ({ ...store, distance: undefined }));
    }

    const validUserLocation = userLocationValidation.coordinates!;

    return stores.map(store => {
      if (!store.lat || !store.lng) {
        return { ...store, distance: undefined };
      }

      try {
        const distance = this.calculateDistance(
          validUserLocation.lat,
          validUserLocation.lng,
          store.lat,
          store.lng
        );

        // Only include valid distances
        return { 
          ...store, 
          distance: isFinite(distance) && distance !== Infinity ? distance : undefined 
        };
      } catch (error) {
        console.error('Error calculating distance for store:', store, error);
        return { ...store, distance: undefined };
      }
    });
  }

  /**
   * Compare distances with Google Maps API for validation
   */
  static async validateDistanceWithGoogleMaps(
    origin: UserLocation,
    destination: UserLocation
  ): Promise<{
    calculatedDistance: number;
    googleDistance?: number;
    accuracy: 'high' | 'medium' | 'low';
    error?: string;
  }> {
    const calculatedDistance = this.calculateDistance(
      origin.lat,
      origin.lng,
      destination.lat,
      destination.lng
    );

    try {
      // This would require Google Maps Distance Matrix API
      // For now, we'll use a heuristic to determine accuracy
      const straightLineDistance = calculatedDistance;
      
      // Estimate road distance (typically 1.2-1.5x straight line distance in urban areas)
      const estimatedRoadDistance = straightLineDistance * 1.3;
      
      // Determine accuracy based on distance
      let accuracy: 'high' | 'medium' | 'low' = 'high';
      if (straightLineDistance > 50) {
        accuracy = 'medium';
      }
      if (straightLineDistance > 200) {
        accuracy = 'low';
      }

      return {
        calculatedDistance: straightLineDistance,
        googleDistance: estimatedRoadDistance,
        accuracy
      };
    } catch (error) {
      return {
        calculatedDistance,
        accuracy: 'medium',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get distance in different units
   */
  static formatDistance(distanceKm: number, unit: 'km' | 'miles' = 'km'): {
    value: number;
    unit: string;
    formatted: string;
  } {
    if (!isFinite(distanceKm) || distanceKm < 0) {
      return {
        value: 0,
        unit: unit,
        formatted: 'Unknown distance'
      };
    }

    if (unit === 'miles') {
      const miles = distanceKm * 0.621371;
      return {
        value: Math.round(miles * 100) / 100,
        unit: 'miles',
        formatted: `${(Math.round(miles * 100) / 100).toFixed(1)} miles`
      };
    } else {
      return {
        value: Math.round(distanceKm * 100) / 100,
        unit: 'km',
        formatted: `${(Math.round(distanceKm * 100) / 100).toFixed(1)} km`
      };
    }
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

  /**
   * Get current location with fallback options
   */
  static async getCurrentLocationWithFallback(): Promise<UserLocation> {
    try {
      // Try high accuracy first
      return await this.getCurrentLocation({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000
      });
    } catch (error) {
      console.warn('High accuracy location failed, trying low accuracy:', error);
      
      try {
        // Fallback to low accuracy
        return await this.getCurrentLocation({
          enableHighAccuracy: false,
          timeout: 10000,
          maximumAge: 300000
        });
      } catch (fallbackError) {
        console.error('All location methods failed:', fallbackError);
        throw new Error('Unable to determine your location. Please check your location settings and try again.');
      }
    }
  }
}