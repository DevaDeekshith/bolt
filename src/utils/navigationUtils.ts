import { UserLocation } from '../types/store';

export interface NavigationOptions {
  origin: UserLocation;
  destination: { lat: number; lng: number };
  destinationName?: string;
}

export class NavigationService {
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
   * Generate Google Maps web URL with proper address filling
   */
  static generateWebMapsUrl(options: NavigationOptions): string {
    const { origin, destination, destinationName } = options;
    
    // Create a comprehensive destination string that includes both name and coordinates
    let destinationParam = '';
    if (destinationName) {
      // Include both the name and coordinates for better accuracy
      destinationParam = `${encodeURIComponent(destinationName)}/@${destination.lat},${destination.lng}`;
    } else {
      destinationParam = `${destination.lat},${destination.lng}`;
    }

    const params = new URLSearchParams({
      api: '1',
      origin: `${origin.lat},${origin.lng}`,
      destination: destinationParam,
      travelmode: 'driving'
    });

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  /**
   * Generate mobile app deep link URL with proper address filling
   */
  static generateMobileAppUrl(options: NavigationOptions): string {
    const { origin, destination, destinationName } = options;
    const platform = this.getMobilePlatform();
    
    if (platform === 'ios') {
      // iOS Google Maps app URL scheme with proper address
      const params = new URLSearchParams({
        saddr: `${origin.lat},${origin.lng}`,
        daddr: destinationName ? `${destinationName}` : `${destination.lat},${destination.lng}`,
        directionsmode: 'driving'
      });
      
      return `comgooglemaps://?${params.toString()}`;
    } else {
      // Android - use intent URL that properly fills the address
      const destinationString = destinationName 
        ? encodeURIComponent(destinationName)
        : `${destination.lat},${destination.lng}`;
      
      return `intent://maps.google.com/maps/dir/${origin.lat},${origin.lng}/${destinationString}/@${destination.lat},${destination.lng},15z/data=!4m2!4m1!3e0#Intent;scheme=https;package=com.google.android.apps.maps;end`;
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
        
        try {
          // For mobile, try to open the app directly
          window.location.href = appUrl;
          
          // Wait a moment to see if the app opens
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          return { success: true, method: 'app' };
        } catch (error) {
          // Fallback to web version
          const webUrl = this.generateWebMapsUrl(options);
          window.open(webUrl, '_blank', 'noopener,noreferrer');
          return { success: true, method: 'fallback' };
        }
      } else {
        // Desktop - open web version in new tab
        const webUrl = this.generateWebMapsUrl(options);
        const newWindow = window.open(webUrl, '_blank', 'noopener,noreferrer');
        
        if (!newWindow) {
          // If popup is blocked, try to navigate in same tab
          window.location.href = webUrl;
        }
        
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
          'fallback': 'Google Maps (Web)'
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