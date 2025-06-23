export interface Store {
  id: string;
  name: string;
  location: string;
  lat?: number;
  lng?: number;
  distance?: number;
  hours?: string;
  phone?: string;
  image?: string;
}

export interface GeocodeResponse {
  geocodingResults: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

export interface DirectionsResponse {
  routes: Array<{
    geometry: {
      coordinates: Array<[number, number]>;
    };
    legs: Array<{
      distance: {
        text: string;
        value: number;
      };
      duration: {
        text: string;
        value: number;
      };
    }>;
  }>;
}

export interface UserLocation {
  lat: number;
  lng: number;
}