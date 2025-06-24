import { UserLocation } from '../types/store';
import { LocationService } from './locationService';

export interface NavigationDestination {
  lat: number;
  lng: number;
  name?: string;
  address?: string;
}

export interface NavigationResult {
  success: boolean;
  method: 'app' | 'web' | 'fallback';
  url?: string;
  error?: string;
}

export interface DeviceCapabilities {
  isMobile: boolean;
  platform: 'ios' | 'android' | 'other';
  hasGoogleMaps: boolean;
  supportsUniversalLinks: boolean;
}

export class EnhancedNavigationService {
  private static readonly GOOGLE_MAPS_PACKAGE = 'com.google.android.apps.maps';
  private static readonly APPLE_MAPS_SCHEME = 'maps://';
  private static readonly GOOGLE_MAPS_IOS_SCHEME = 'comgooglemaps://';
  private static readonly GOOGLE_MAPS_ANDROID_INTENT = 'google.navigation';
  
  // Rate limiting
  private static lastNavigationTime = 0;
  private static readonly NAVIGATION_COOLDOWN = 2000; // 2 seconds

  /**
   * Detect device capabilities for optimal navigation
   */
  static getDeviceCapabilities(): DeviceCapabilities {
    const userAgent = navigator.userAgent.toLowerCase();
    const isMobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
    
    let platform: 'ios' | 'android' | 'other' = 'other';
    if (/ipad|iphone|ipod/.test(userAgent)) {
      platform = 'ios';
    } else if (/android/.test(userAgent)) {
      platform = 'android';
    }

    return {
      isMobile,
      platform,
      hasGoogleMaps: this.detectGoogleMapsApp(platform),
      supportsUniversalLinks: platform === 'ios' && 'serviceWorker' in navigator
    };
  }

  /**
   * Detect if Google Maps app is likely installed
   */
  private static detectGoogleMapsApp(platform: 'ios' | 'android' | 'other'): boolean {
    // This is a best-effort detection since we can't directly check app installation
    // We'll use user agent hints and known patterns
    
    if (platform === 'android') {
      // Check for Google Play Services indicators
      return /gms|google/i.test(navigator.userAgent);
    }
    
    if (platform === 'ios') {
      // iOS doesn't allow direct app detection, assume Google Maps might be installed
      return true;
    }
    
    return false;
  }

  /**
   * Sanitize and validate location parameters
   */
  static sanitizeLocationParams(destination: NavigationDestination): {
    isValid: boolean;
    sanitized?: NavigationDestination;
    error?: string;
  } {
    // Validate coordinates
    const coordValidation = LocationService.validateCoordinates({
      lat: destination.lat,
      lng: destination.lng
    });

    if (!coordValidation.isValid) {
      return {
        isValid: false,
        error: coordValidation.error
      };
    }

    // Sanitize name and address
    const sanitizeName = (str?: string): string | undefined => {
      if (!str) return undefined;
      return str
        .replace(/[<>\"'&]/g, '') // Remove potentially dangerous characters
        .trim()
        .substring(0, 100); // Limit length
    };

    return {
      isValid: true,
      sanitized: {
        lat: coordValidation.coordinates!.lat,
        lng: coordValidation.coordinates!.lng,
        name: sanitizeName(destination.name),
        address: sanitizeName(destination.address)
      }
    };
  }

  /**
   * Generate Google Maps web URL with proper encoding
   */
  static generateWebMapsUrl(
    origin: UserLocation,
    destination: NavigationDestination
  ): string {
    const sanitized = this.sanitizeLocationParams(destination);
    if (!sanitized.isValid || !sanitized.sanitized) {
      throw new Error(sanitized.error || 'Invalid destination');
    }

    const dest = sanitized.sanitized;
    const params = new URLSearchParams();
    
    // Use coordinates for precision, but include name for better UX
    const destinationParam = dest.name 
      ? `${encodeURIComponent(dest.name)}/@${dest.lat},${dest.lng}`
      : `${dest.lat},${dest.lng}`;
    
    params.append('api', '1');
    params.append('origin', `${origin.lat},${origin.lng}`);
    params.append('destination', destinationParam);
    params.append('travelmode', 'driving');
    
    // Add additional context if available
    if (dest.address) {
      params.append('query', encodeURIComponent(dest.address));
    }

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  /**
   * Generate iOS Google Maps app URL
   */
  static generateiOSGoogleMapsUrl(
    origin: UserLocation,
    destination: NavigationDestination
  ): string {
    const sanitized = this.sanitizeLocationParams(destination);
    if (!sanitized.isValid || !sanitized.sanitized) {
      throw new Error(sanitized.error || 'Invalid destination');
    }

    const dest = sanitized.sanitized;
    const params = new URLSearchParams();
    
    params.append('saddr', `${origin.lat},${origin.lng}`);
    params.append('daddr', `${dest.lat},${dest.lng}`);
    params.append('directionsmode', 'driving');
    
    if (dest.name) {
      params.append('q', encodeURIComponent(dest.name));
    }

    return `${this.GOOGLE_MAPS_IOS_SCHEME}?${params.toString()}`;
  }

  /**
   * Generate Android Google Maps intent URL
   */
  static generateAndroidGoogleMapsUrl(
    origin: UserLocation,
    destination: NavigationDestination
  ): string {
    const sanitized = this.sanitizeLocationParams(destination);
    if (!sanitized.isValid || !sanitized.sanitized) {
      throw new Error(sanitized.error || 'Invalid destination');
    }

    const dest = sanitized.sanitized;
    
    // Use Google Maps navigation intent
    const intentUrl = `intent://maps.google.com/maps/dir/${origin.lat},${origin.lng}/${dest.lat},${dest.lng}/@${dest.lat},${dest.lng},15z/data=!4m2!4m1!3e0#Intent;scheme=https;package=${this.GOOGLE_MAPS_PACKAGE};end`;
    
    return intentUrl;
  }

  /**
   * Generate Apple Maps URL for iOS fallback
   */
  static generateAppleMapsUrl(
    origin: UserLocation,
    destination: NavigationDestination
  ): string {
    const sanitized = this.sanitizeLocationParams(destination);
    if (!sanitized.isValid || !sanitized.sanitized) {
      throw new Error(sanitized.error || 'Invalid destination');
    }

    const dest = sanitized.sanitized;
    const params = new URLSearchParams();
    
    params.append('saddr', `${origin.lat},${origin.lng}`);
    params.append('daddr', `${dest.lat},${dest.lng}`);
    params.append('dirflg', 'd'); // driving directions
    
    if (dest.name) {
      params.append('q', encodeURIComponent(dest.name));
    }

    return `${this.APPLE_MAPS_SCHEME}?${params.toString()}`;
  }

  /**
   * Attempt to open navigation app with fallbacks
   */
  static async openNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    // Rate limiting check
    const now = Date.now();
    if (now - this.lastNavigationTime < this.NAVIGATION_COOLDOWN) {
      return {
        success: false,
        method: 'fallback',
        error: 'Please wait before opening navigation again'
      };
    }
    this.lastNavigationTime = now;

    try {
      onStatusUpdate?.('Preparing navigation...');
      
      const capabilities = this.getDeviceCapabilities();
      const sanitized = this.sanitizeLocationParams(destination);
      
      if (!sanitized.isValid) {
        throw new Error(sanitized.error || 'Invalid destination coordinates');
      }

      onStatusUpdate?.('Opening navigation app...');

      if (capabilities.isMobile) {
        return await this.openMobileNavigation(origin, destination, capabilities, onStatusUpdate);
      } else {
        return await this.openWebNavigation(origin, destination, onStatusUpdate);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      return {
        success: false,
        method: 'fallback',
        error: error instanceof Error ? error.message : 'Navigation failed'
      };
    }
  }

  /**
   * Handle mobile navigation with app detection and fallbacks
   */
  private static async openMobileNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    capabilities: DeviceCapabilities,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      if (capabilities.platform === 'ios') {
        return await this.openiOSNavigation(origin, destination, onStatusUpdate);
      } else if (capabilities.platform === 'android') {
        return await this.openAndroidNavigation(origin, destination, onStatusUpdate);
      } else {
        // Fallback to web for other mobile platforms
        return await this.openWebNavigation(origin, destination, onStatusUpdate);
      }
    } catch (error) {
      console.error('Mobile navigation error:', error);
      // Fallback to web navigation
      return await this.openWebNavigation(origin, destination, onStatusUpdate);
    }
  }

  /**
   * Handle iOS navigation with Google Maps and Apple Maps fallback
   */
  private static async openiOSNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      // Try Google Maps app first
      const googleMapsUrl = this.generateiOSGoogleMapsUrl(origin, destination);
      
      onStatusUpdate?.('Opening Google Maps...');
      
      // Create a hidden iframe to test if the app can handle the URL
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = googleMapsUrl;
      document.body.appendChild(iframe);
      
      // Wait a moment to see if the app opens
      await new Promise(resolve => setTimeout(resolve, 1000));
      document.body.removeChild(iframe);
      
      // If we reach here, assume the app opened successfully
      return {
        success: true,
        method: 'app',
        url: googleMapsUrl
      };
    } catch (error) {
      console.warn('Google Maps app failed, trying Apple Maps:', error);
      
      try {
        // Fallback to Apple Maps
        const appleMapsUrl = this.generateAppleMapsUrl(origin, destination);
        onStatusUpdate?.('Opening Apple Maps...');
        
        window.location.href = appleMapsUrl;
        
        return {
          success: true,
          method: 'app',
          url: appleMapsUrl
        };
      } catch (appleError) {
        console.warn('Apple Maps failed, falling back to web:', appleError);
        return await this.openWebNavigation(origin, destination, onStatusUpdate);
      }
    }
  }

  /**
   * Handle Android navigation with Google Maps intent
   */
  private static async openAndroidNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      const intentUrl = this.generateAndroidGoogleMapsUrl(origin, destination);
      
      onStatusUpdate?.('Opening Google Maps...');
      
      // Try to open with intent
      window.location.href = intentUrl;
      
      return {
        success: true,
        method: 'app',
        url: intentUrl
      };
    } catch (error) {
      console.warn('Android Google Maps intent failed, falling back to web:', error);
      return await this.openWebNavigation(origin, destination, onStatusUpdate);
    }
  }

  /**
   * Handle web navigation as fallback
   */
  private static async openWebNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      const webUrl = this.generateWebMapsUrl(origin, destination);
      
      onStatusUpdate?.('Opening Google Maps in browser...');
      
      // Open in new tab/window
      const newWindow = window.open(webUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        throw new Error('Popup blocked. Please allow popups for this site.');
      }
      
      return {
        success: true,
        method: 'web',
        url: webUrl
      };
    } catch (error) {
      console.error('Web navigation failed:', error);
      return {
        success: false,
        method: 'fallback',
        error: error instanceof Error ? error.message : 'Failed to open navigation'
      };
    }
  }

  /**
   * Validate destination exists in Google Maps (optional verification)
   */
  static async validateDestination(destination: NavigationDestination): Promise<boolean> {
    try {
      // This is a simplified validation - in production, you might want to use
      // Google Places API or similar to verify the location exists
      const sanitized = this.sanitizeLocationParams(destination);
      return sanitized.isValid;
    } catch (error) {
      console.error('Destination validation error:', error);
      return false;
    }
  }

  /**
   * Get navigation statistics for monitoring
   */
  static getNavigationStats(): {
    lastNavigationTime: number;
    cooldownRemaining: number;
    deviceCapabilities: DeviceCapabilities;
  } {
    const now = Date.now();
    const cooldownRemaining = Math.max(0, this.NAVIGATION_COOLDOWN - (now - this.lastNavigationTime));
    
    return {
      lastNavigationTime: this.lastNavigationTime,
      cooldownRemaining,
      deviceCapabilities: this.getDeviceCapabilities()
    };
  }
}