import { Store, GeocodeResponse, DirectionsResponse, UserLocation } from '../types/store';

const API_KEY = 'cgDoFOA0AybOu0oZZm4yaG9mvf85rQlqwMNS6F7h';

export class OlaMapService {
  private apiKey: string;

  constructor() {
    this.apiKey = API_KEY;
  }

  private sanitizeAddress(address: string): string {
    // Normalize the string to decompose accented characters
    const normalized = address.normalize('NFD');
    
    // Remove diacritics (accents, umlauts, etc.) and keep only English characters
    const sanitized = normalized
      .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritical marks
      .replace(/[^\x00-\x7F]/g, '') // Remove non-ASCII characters
      .replace(/[^a-zA-Z0-9\s\-.,#]/g, '') // Keep only letters, numbers, spaces, and common punctuation
      .trim()
      .replace(/\s+/g, ' '); // Normalize multiple spaces to single space
    
    return sanitized;
  }

  async geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
    if (!this.apiKey) {
      console.error('OlaMaps API key is missing');
      return null;
    }

    try {
      // Sanitize the address to remove non-English characters
      const sanitizedAddress = this.sanitizeAddress(address);
      
      if (!sanitizedAddress.trim()) {
        console.warn('Address became empty after sanitization:', address);
        return null;
      }

      const response = await fetch(
        `https://api.olamaps.io/places/v1/geocode?address=${encodeURIComponent(sanitizedAddress)}&api_key=${this.apiKey}`
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Geocoding API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
          originalAddress: address,
          sanitizedAddress: sanitizedAddress
        });
        
        // Fallback to a simple coordinate estimation for Indian locations
        return this.fallbackGeocode(sanitizedAddress);
      }
      
      const data: GeocodeResponse = await response.json();
      
      if (data.geocodingResults && data.geocodingResults.length > 0) {
        const location = data.geocodingResults[0].geometry.location;
        return { lat: location.lat, lng: location.lng };
      }
      
      console.warn('No geocoding results found for address:', sanitizedAddress, '(original:', address, ')');
      return this.fallbackGeocode(sanitizedAddress);
    } catch (error) {
      console.error('Geocoding error:', error);
      return this.fallbackGeocode(address);
    }
  }

  private fallbackGeocode(address: string): { lat: number; lng: number } | null {
    // Enhanced fallback geocoding for Indian locations with more accurate coordinates
    const locationCoordinates: { [key: string]: { lat: number; lng: number } } = {
      // Bangalore areas
      'basaveshwaranagar': { lat: 12.9784, lng: 77.5408 },
      'basaveshwara nagar': { lat: 12.9784, lng: 77.5408 },
      'rajajinagar': { lat: 12.9915, lng: 77.5520 },
      'malleshwaram': { lat: 13.0031, lng: 77.5811 },
      'jayanagar': { lat: 12.9279, lng: 77.5937 },
      'koramangala': { lat: 12.9352, lng: 77.6245 },
      'indiranagar': { lat: 12.9719, lng: 77.6412 },
      'whitefield': { lat: 12.9698, lng: 77.7500 },
      'electronic city': { lat: 12.8456, lng: 77.6603 },
      'btm layout': { lat: 12.9165, lng: 77.6101 },
      'hsr layout': { lat: 12.9116, lng: 77.6370 },
      'marathahalli': { lat: 12.9591, lng: 77.6974 },
      'hebbal': { lat: 13.0358, lng: 77.5970 },
      'yelahanka': { lat: 13.1007, lng: 77.5963 },
      'banashankari': { lat: 12.9249, lng: 77.5657 },
      'jp nagar': { lat: 12.9081, lng: 77.5831 },
      'vijayanagar': { lat: 12.9634, lng: 77.5855 },
      'rt nagar': { lat: 13.0199, lng: 77.5955 },
      'sadashivanagar': { lat: 13.0067, lng: 77.5804 },
      'seshadripuram': { lat: 12.9890, lng: 77.5707 },
      
      // Major cities
      'bangalore': { lat: 12.9716, lng: 77.5946 },
      'bengaluru': { lat: 12.9716, lng: 77.5946 },
      'mumbai': { lat: 19.0760, lng: 72.8777 },
      'delhi': { lat: 28.7041, lng: 77.1025 },
      'chennai': { lat: 13.0827, lng: 80.2707 },
      'kolkata': { lat: 22.5726, lng: 88.3639 },
      'hyderabad': { lat: 17.3850, lng: 78.4867 },
      'pune': { lat: 18.5204, lng: 73.8567 },
      'ahmedabad': { lat: 23.0225, lng: 72.5714 },
      'jaipur': { lat: 26.9124, lng: 75.7873 },
      'surat': { lat: 21.1702, lng: 72.8311 },
      'lucknow': { lat: 26.8467, lng: 80.9462 },
      'kanpur': { lat: 26.4499, lng: 80.3319 },
      'nagpur': { lat: 21.1458, lng: 79.0882 },
      'indore': { lat: 22.7196, lng: 75.8577 },
      'thane': { lat: 19.2183, lng: 72.9781 },
      'bhopal': { lat: 23.2599, lng: 77.4126 },
      'visakhapatnam': { lat: 17.6868, lng: 83.2185 },
      'pimpri': { lat: 18.6298, lng: 73.7997 },
      'patna': { lat: 25.5941, lng: 85.1376 },
      
      // States for very broad searches
      'karnataka': { lat: 15.3173, lng: 75.7139 },
      'assam': { lat: 26.2006, lng: 92.9376 },
      'maharashtra': { lat: 19.7515, lng: 75.7139 },
      'tamil nadu': { lat: 11.1271, lng: 78.6569 },
      'west bengal': { lat: 22.9868, lng: 87.8550 },
      'telangana': { lat: 18.1124, lng: 79.0193 },
      'gujarat': { lat: 22.2587, lng: 71.1924 },
      'rajasthan': { lat: 27.0238, lng: 74.2179 },
      'uttar pradesh': { lat: 26.8467, lng: 80.9462 },
      'madhya pradesh': { lat: 22.9734, lng: 78.6569 },
      'bihar': { lat: 25.0961, lng: 85.3131 },
      'odisha': { lat: 20.9517, lng: 85.0985 },
      'kerala': { lat: 10.8505, lng: 76.2711 },
      'punjab': { lat: 31.1471, lng: 75.3412 },
      'haryana': { lat: 29.0588, lng: 76.0856 },
      'jharkhand': { lat: 23.6102, lng: 85.2799 },
      'chhattisgarh': { lat: 21.2787, lng: 81.8661 },
      'uttarakhand': { lat: 30.0668, lng: 79.0193 },
      'himachal pradesh': { lat: 31.1048, lng: 77.1734 },
      'jammu and kashmir': { lat: 33.7782, lng: 76.5762 },
      'goa': { lat: 15.2993, lng: 74.1240 },
      'manipur': { lat: 24.6637, lng: 93.9063 },
      'meghalaya': { lat: 25.4670, lng: 91.3662 },
      'tripura': { lat: 23.9408, lng: 91.9882 },
      'nagaland': { lat: 26.1584, lng: 94.5624 },
      'mizoram': { lat: 23.1645, lng: 92.9376 },
      'arunachal pradesh': { lat: 28.2180, lng: 94.7278 },
      'sikkim': { lat: 27.5330, lng: 88.5122 },
      'andhra pradesh': { lat: 15.9129, lng: 79.7400 }
    };

    const addressLower = address.toLowerCase();
    
    // First try exact matches
    for (const [location, coords] of Object.entries(locationCoordinates)) {
      if (addressLower === location || addressLower.includes(location)) {
        console.log(`Using coordinates for ${location}:`, coords);
        // Add minimal random offset to avoid exact duplicates
        return {
          lat: coords.lat + (Math.random() - 0.5) * 0.01,
          lng: coords.lng + (Math.random() - 0.5) * 0.01
        };
      }
    }

    // Then try partial matches
    for (const [location, coords] of Object.entries(locationCoordinates)) {
      if (addressLower.includes(location.split(' ')[0])) {
        console.log(`Using partial match coordinates for ${location}:`, coords);
        return {
          lat: coords.lat + (Math.random() - 0.5) * 0.05,
          lng: coords.lng + (Math.random() - 0.5) * 0.05
        };
      }
    }

    // Default to Bangalore if no match is found
    console.log('Using default Bangalore coordinates for address:', address);
    return {
      lat: 12.9716 + (Math.random() - 0.5) * 0.1,
      lng: 77.5946 + (Math.random() - 0.5) * 0.1
    };
  }

  async getDirections(origin: UserLocation, destination: { lat: number; lng: number }): Promise<DirectionsResponse | null> {
    if (!this.apiKey) {
      console.error('OlaMaps API key is missing');
      return null;
    }

    try {
      const url = new URL('https://api.olamaps.io/routing/v1/directions');
      url.searchParams.append('origin', `${origin.lat},${origin.lng}`);
      url.searchParams.append('destination', `${destination.lat},${destination.lng}`);
      url.searchParams.append('api_key', this.apiKey);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'X-Request-Id': `directions-${Date.now()}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Directions API error:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText
        });
        
        // Return a simple straight line as fallback
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
                text: `${this.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng).toFixed(1)} km`,
                value: this.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng) * 1000
              },
              duration: {
                text: 'Estimated',
                value: 0
              }
            }]
          }]
        };
      }

      return await response.json();
    } catch (error) {
      console.error('Directions error:', error);
      
      // Return a simple straight line as fallback
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
              text: `${this.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng).toFixed(1)} km`,
              value: this.calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng) * 1000
            },
            duration: {
              text: 'Estimated',
              value: 0
            }
          }]
        }]
      };
    }
  }

  // Improved Haversine formula for more accurate distance calculation
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in kilometers
    
    // Convert degrees to radians
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;
    const deltaLatRad = (lat2 - lat1) * Math.PI / 180;
    const deltaLngRad = (lng2 - lng1) * Math.PI / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
              Math.cos(lat1Rad) * Math.cos(lat2Rad) *
              Math.sin(deltaLngRad / 2) * Math.sin(deltaLngRad / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    const distance = R * c;
    
    // Round to 2 decimal places for better accuracy
    return Math.round(distance * 100) / 100;
  }
}

export const olaMapService = new OlaMapService();