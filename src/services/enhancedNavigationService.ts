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

  // Session state management
  private static sessionState = {
    lastUserLocation: null as UserLocation | null,
    lastSelectedStore: null as any,
    returnUrl: null as string | null
  };

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
    if (platform === 'android') {
      return /gms|google/i.test(navigator.userAgent);
    }
    
    if (platform === 'ios') {
      return true;
    }
    
    return false;
  }

  /**
   * Save session state before navigation
   */
  static saveSessionState(userLocation: UserLocation | null, selectedStore: any): void {
    this.sessionState = {
      lastUserLocation: userLocation,
      lastSelectedStore: selectedStore,
      returnUrl: window.location.href
    };
    
    // Store in sessionStorage for persistence across page reloads
    try {
      sessionStorage.setItem('storeLocatorState', JSON.stringify(this.sessionState));
    } catch (error) {
      console.warn('Failed to save session state:', error);
    }
  }

  /**
   * Restore session state after returning from navigation
   */
  static restoreSessionState(): {
    userLocation: UserLocation | null;
    selectedStore: any;
    returnUrl: string | null;
  } {
    try {
      const saved = sessionStorage.getItem('storeLocatorState');
      if (saved) {
        const state = JSON.parse(saved);
        this.sessionState = state;
        return state;
      }
    } catch (error) {
      console.warn('Failed to restore session state:', error);
    }
    
    return {
      userLocation: this.sessionState.lastUserLocation,
      selectedStore: this.sessionState.lastSelectedStore,
      returnUrl: this.sessionState.returnUrl
    };
  }

  /**
   * Clear session state
   */
  static clearSessionState(): void {
    this.sessionState = {
      lastUserLocation: null,
      lastSelectedStore: null,
      returnUrl: null
    };
    
    try {
      sessionStorage.removeItem('storeLocatorState');
    } catch (error) {
      console.warn('Failed to clear session state:', error);
    }
  }

  /**
   * Sanitize and validate location parameters
   */
  static sanitizeLocationParams(destination: NavigationDestination): {
    isValid: boolean;
    sanitized?: NavigationDestination;
    error?: string;
  } {
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

    const sanitizeName = (str?: string): string | undefined => {
      if (!str) return undefined;
      return str
        .replace(/[<>\"'&]/g, '')
        .trim()
        .substring(0, 100);
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
   * Generate Google Maps web URL with enhanced address filling and proper target handling
   */
  static generateWebMapsUrl(
    origin: UserLocation,
    destination: NavigationDestination,
    options: { preventRedirect?: boolean } = {}
  ): string {
    const sanitized = this.sanitizeLocationParams(destination);
    if (!sanitized.isValid || !sanitized.sanitized) {
      throw new Error(sanitized.error || 'Invalid destination');
    }

    const dest = sanitized.sanitized;
    const params = new URLSearchParams();
    
    // Enhanced destination parameter with full address for auto-filling
    let destinationParam = '';
    if (dest.name && dest.address) {
      destinationParam = `${encodeURIComponent(dest.name + ', ' + dest.address)}`;
    } else if (dest.name) {
      destinationParam = `${encodeURIComponent(dest.name)}/@${dest.lat},${dest.lng}`;
    } else {
      destinationParam = `${dest.lat},${dest.lng}`;
    }
    
    params.append('api', '1');
    params.append('origin', `${origin.lat},${origin.lng}`);
    params.append('destination', destinationParam);
    params.append('travelmode', 'driving');
    
    // Add query parameter for better search results
    if (dest.name) {
      params.append('query', encodeURIComponent(dest.name));
    }

    // Add return URL parameter to help with navigation back
    if (!options.preventRedirect && this.sessionState.returnUrl) {
      params.append('callback', encodeURIComponent(this.sessionState.returnUrl));
    }

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  /**
   * Generate iOS Google Maps app URL with enhanced address filling
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
    
    // Enhanced destination with full address for auto-filling
    if (dest.name && dest.address) {
      params.append('daddr', encodeURIComponent(`${dest.name}, ${dest.address}`));
    } else if (dest.name) {
      params.append('daddr', encodeURIComponent(dest.name));
    } else {
      params.append('daddr', `${dest.lat},${dest.lng}`);
    }
    
    params.append('directionsmode', 'driving');
    
    if (dest.name) {
      params.append('q', encodeURIComponent(dest.name));
    }

    // Add callback URL for iOS
    if (this.sessionState.returnUrl) {
      params.append('callback', encodeURIComponent(this.sessionState.returnUrl));
    }

    return `${this.GOOGLE_MAPS_IOS_SCHEME}?${params.toString()}`;
  }

  /**
   * Generate Android Google Maps intent URL with enhanced address filling
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
    
    // Enhanced destination string for better auto-filling
    let destinationString = '';
    if (dest.name && dest.address) {
      destinationString = encodeURIComponent(`${dest.name}, ${dest.address}`);
    } else if (dest.name) {
      destinationString = encodeURIComponent(dest.name);
    } else {
      destinationString = `${dest.lat},${dest.lng}`;
    }
    
    const intentUrl = `intent://maps.google.com/maps/dir/${origin.lat},${origin.lng}/${destinationString}/@${dest.lat},${dest.lng},15z/data=!4m2!4m1!3e0#Intent;scheme=https;package=${this.GOOGLE_MAPS_PACKAGE};end`;
    
    return intentUrl;
  }

  /**
   * Generate Apple Maps URL for iOS fallback with enhanced address filling
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
    
    // Enhanced destination for Apple Maps
    if (dest.name && dest.address) {
      params.append('daddr', encodeURIComponent(`${dest.name}, ${dest.address}`));
    } else if (dest.name) {
      params.append('daddr', encodeURIComponent(dest.name));
    } else {
      params.append('daddr', `${dest.lat},${dest.lng}`);
    }
    
    params.append('dirflg', 'd');
    
    if (dest.name) {
      params.append('q', encodeURIComponent(dest.name));
    }

    return `${this.APPLE_MAPS_SCHEME}?${params.toString()}`;
  }

  /**
   * Enhanced navigation opening with better redirect handling
   */
  static async openNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void,
    selectedStore?: any
  ): Promise<NavigationResult> {
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
      
      // Save session state before navigation
      this.saveSessionState(origin, selectedStore);
      
      const capabilities = this.getDeviceCapabilities();
      const sanitized = this.sanitizeLocationParams(destination);
      
      if (!sanitized.isValid) {
        throw new Error(sanitized.error || 'Invalid destination coordinates');
      }

      onStatusUpdate?.('Opening navigation app...');

      // Check if we're in an embedded environment (like Shopify)
      const isEmbedded = window !== window.top;
      
      if (isEmbedded) {
        // For embedded environments, use postMessage to parent window
        return await this.openEmbeddedNavigation(origin, destination, onStatusUpdate);
      } else if (capabilities.isMobile) {
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
   * Handle navigation in embedded environments (like Shopify)
   */
  private static async openEmbeddedNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      const capabilities = this.getDeviceCapabilities();
      let navigationUrl = '';
      
      if (capabilities.isMobile) {
        if (capabilities.platform === 'ios') {
          navigationUrl = this.generateiOSGoogleMapsUrl(origin, destination);
        } else if (capabilities.platform === 'android') {
          navigationUrl = this.generateAndroidGoogleMapsUrl(origin, destination);
        } else {
          navigationUrl = this.generateWebMapsUrl(origin, destination);
        }
      } else {
        navigationUrl = this.generateWebMapsUrl(origin, destination);
      }

      // Send message to parent window for navigation handling
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'NAVIGATION_REQUEST',
          url: navigationUrl,
          target: '_blank',
          address: destination.address,
          storeName: destination.name,
          requestId: Date.now().toString()
        }, '*');
        
        onStatusUpdate?.('Navigation request sent to parent window');
        
        return {
          success: true,
          method: 'app',
          url: navigationUrl
        };
      } else {
        // Fallback to direct navigation with proper target handling
        return await this.openDirectNavigation(navigationUrl, onStatusUpdate, true);
      }
    } catch (error) {
      console.error('Embedded navigation error:', error);
      return await this.openWebNavigation(origin, destination, onStatusUpdate);
    }
  }

  /**
   * Direct navigation opening with enhanced compatibility and redirect handling
   */
  private static async openDirectNavigation(
    url: string,
    onStatusUpdate?: (status: string) => void,
    forceNewWindow: boolean = false
  ): Promise<NavigationResult> {
    try {
      if (url.startsWith('comgooglemaps://') || url.startsWith('intent://')) {
        // Mobile app deep links - these should open in the app and return properly
        window.location.href = url;
        onStatusUpdate?.('Opened in Google Maps app');
        return { success: true, method: 'app', url };
      } else {
        // Web URLs with enhanced popup handling to prevent redirect issues
        const windowFeatures = forceNewWindow 
          ? 'noopener,noreferrer,popup=yes,width=1200,height=800,scrollbars=yes,resizable=yes'
          : 'noopener,noreferrer';
        
        const newWindow = window.open(url, '_blank', windowFeatures);
        
        if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
          // Popup blocked, try alternative methods
          onStatusUpdate?.('Popup blocked, trying alternative method...');
          
          // Create a temporary link element to handle the navigation properly
          const link = document.createElement('a');
          link.href = url;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          
          // Add to DOM temporarily and click
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          onStatusUpdate?.('Opened in new tab');
          return { success: true, method: 'web', url };
        } else {
          onStatusUpdate?.('Opened in Google Maps (Web)');
          
          // Set up a listener to detect when the user returns
          this.setupReturnListener(newWindow);
          
          return { success: true, method: 'web', url };
        }
      }
    } catch (error) {
      throw new Error(`Direct navigation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set up listener to detect when user returns from navigation
   */
  private static setupReturnListener(navigationWindow: Window): void {
    const checkClosed = () => {
      if (navigationWindow.closed) {
        console.log('User returned from navigation');
        // Restore any necessary state
        const state = this.restoreSessionState();
        if (state.userLocation || state.selectedStore) {
          // Trigger a custom event to notify the app
          window.dispatchEvent(new CustomEvent('navigationReturn', {
            detail: state
          }));
        }
        return;
      }
      setTimeout(checkClosed, 1000);
    };
    
    setTimeout(checkClosed, 1000);
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
        return await this.openWebNavigation(origin, destination, onStatusUpdate);
      }
    } catch (error) {
      console.error('Mobile navigation error:', error);
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
      const googleMapsUrl = this.generateiOSGoogleMapsUrl(origin, destination);
      onStatusUpdate?.('Opening Google Maps...');
      
      return await this.openDirectNavigation(googleMapsUrl, onStatusUpdate);
    } catch (error) {
      console.warn('Google Maps app failed, trying Apple Maps:', error);
      
      try {
        const appleMapsUrl = this.generateAppleMapsUrl(origin, destination);
        onStatusUpdate?.('Opening Apple Maps...');
        
        return await this.openDirectNavigation(appleMapsUrl, onStatusUpdate);
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
      
      return await this.openDirectNavigation(intentUrl, onStatusUpdate);
    } catch (error) {
      console.warn('Android Google Maps intent failed, falling back to web:', error);
      return await this.openWebNavigation(origin, destination, onStatusUpdate);
    }
  }

  /**
   * Handle web navigation as fallback with enhanced popup handling
   */
  private static async openWebNavigation(
    origin: UserLocation,
    destination: NavigationDestination,
    onStatusUpdate?: (status: string) => void
  ): Promise<NavigationResult> {
    try {
      const webUrl = this.generateWebMapsUrl(origin, destination);
      onStatusUpdate?.('Opening Google Maps in browser...');
      
      return await this.openDirectNavigation(webUrl, onStatusUpdate, true);
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
    sessionState: any;
  } {
    const now = Date.now();
    const cooldownRemaining = Math.max(0, this.NAVIGATION_COOLDOWN - (now - this.lastNavigationTime));
    
    return {
      lastNavigationTime: this.lastNavigationTime,
      cooldownRemaining,
      deviceCapabilities: this.getDeviceCapabilities(),
      sessionState: this.sessionState
    };
  }
}