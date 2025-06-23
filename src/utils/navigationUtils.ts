import { UserLocation } from '../types/store';

export interface NavigationOptions {
  origin: UserLocation;
  destination: { lat: number; lng: number };
  destinationName?: string;
}

export class NavigationService {
  private static readonly GOOGLE_MAPS_API_KEY = 'AIzaSyD7Ysp1nlJR5E_TfM5SxM0LVJoZB9QmNzE';

  /**
   * Detect if the user is on a mobile device
   */
  static isMobileDevice(): boolean {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    // Check for mobile user agents
    const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i;
    
    // Also check for touch capability and screen size
    const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    return mobileRegex.test(userAgent) || (isTouchDevice && isSmallScreen);
  }

  /**
   * Detect the specific mobile platform
   */
  static getMobilePlatform(): 'ios' | 'android' | 'other' {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    
    if (/iPad|iPhone|iPod/.test(userAgent)) {
      return 'ios';
    }
    
    if (/android/i.test(userAgent)) {
      return 'android';
    }
    
    return 'other';
  }

  /**
   * Check if Google Maps app is likely installed (best effort detection)
   */
  static async isGoogleMapsAppAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isMobileDevice()) {
        resolve(false);
        return;
      }

      const platform = this.getMobilePlatform();
      
      // Create a test link to check if the app can handle it
      const testUrl = platform === 'ios' 
        ? 'comgooglemaps://' 
        : 'geo:0,0?q=test';
      
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = testUrl;
      
      let resolved = false;
      
      // Timeout to assume app is not available
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(false);
        }
        document.body.removeChild(iframe);
      }, 1000);
      
      // If the app opens, we won't reach this point quickly
      iframe.onload = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          resolve(true);
          document.body.removeChild(iframe);
        }
      };
      
      document.body.appendChild(iframe);
    });
  }

  /**
   * Generate Google Maps web URL
   */
  static generateWebMapsUrl(options: NavigationOptions): string {
    const { origin, destination, destinationName } = options;
    
    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: destinationName 
        ? `${destinationName}` 
        : `${destination.lat},${destination.lng}`,
      travelmode: 'driving'
    });

    // Add API key if available
    if (this.GOOGLE_MAPS_API_KEY) {
      params.append('key', this.GOOGLE_MAPS_API_KEY);
    }

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  /**
   * Generate mobile app deep link URL
   */
  static generateMobileAppUrl(options: NavigationOptions): string {
    const { origin, destination } = options;
    const platform = this.getMobilePlatform();
    
    if (platform === 'ios') {
      // iOS Google Maps app URL scheme
      const params = new URLSearchParams({
        saddr: `${origin.lat},${origin.lng}`,
        daddr: `${destination.lat},${destination.lng}`,
        directionsmode: 'driving'
      });
      
      return `comgooglemaps://?${params.toString()}`;
    } else {
      // Android Google Maps app URL scheme
      const params = new URLSearchParams({
        api: '1',
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        travelmode: 'driving'
      });
      
      return `https://www.google.com/maps/dir/?${params.toString()}`;
    }
  }

  /**
   * Open navigation with appropriate method based on device
   */
  static async openNavigation(options: NavigationOptions): Promise<{
    success: boolean;
    method: 'web' | 'app' | 'fallback';
    error?: string;
  }> {
    try {
      const isMobile = this.isMobileDevice();
      
      if (isMobile) {
        // Try mobile app first
        const appUrl = this.generateMobileAppUrl(options);
        const webUrl = this.generateWebMapsUrl(options);
        
        try {
          // Attempt to open the app
          const appAvailable = await this.isGoogleMapsAppAvailable();
          
          if (appAvailable) {
            window.location.href = appUrl;
            return { success: true, method: 'app' };
          } else {
            // Fallback to web version
            window.open(webUrl, '_blank', 'noopener,noreferrer');
            return { success: true, method: 'fallback' };
          }
        } catch (error) {
          // Fallback to web version
          window.open(webUrl, '_blank', 'noopener,noreferrer');
          return { success: true, method: 'fallback' };
        }
      } else {
        // Desktop - open web version
        const webUrl = this.generateWebMapsUrl(options);
        window.open(webUrl, '_blank', 'noopener,noreferrer');
        return { success: true, method: 'web' };
      }
    } catch (error) {
      console.error('Navigation error:', error);
      return { 
        success: false, 
        method: 'fallback',
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get user's current location with proper error handling
   */
  static getCurrentLocation(): Promise<UserLocation> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          let errorMessage = 'Failed to get location';
          
          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location access denied. Please enable location services and try again.';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information is unavailable.';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out.';
              break;
            default:
              errorMessage = 'An unknown error occurred while retrieving location.';
              break;
          }
          
          reject(new Error(errorMessage));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  }

  /**
   * Handle navigation with comprehensive error handling and user feedback
   */
  static async handleNavigation(
    destination: { lat: number; lng: number; name?: string },
    userLocation?: UserLocation,
    onStatusUpdate?: (status: string) => void
  ): Promise<void> {
    try {
      onStatusUpdate?.('Getting your location...');
      
      // Get current location if not provided
      const currentLocation = userLocation || await this.getCurrentLocation();
      
      onStatusUpdate?.('Opening navigation...');
      
      const result = await this.openNavigation({
        origin: currentLocation,
        destination,
        destinationName: destination.name
      });

      if (result.success) {
        const methodText = {
          'web': 'Google Maps (Web)',
          'app': 'Google Maps App',
          'fallback': 'Google Maps (Web Fallback)'
        }[result.method];
        
        onStatusUpdate?.(`Opened in ${methodText}`);
      } else {
        throw new Error(result.error || 'Failed to open navigation');
      }
    } catch (error) {
      console.error('Navigation handling error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Navigation failed';
      onStatusUpdate?.(`Error: ${errorMessage}`);
      throw error;
    }
  }
}