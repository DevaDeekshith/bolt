/*
  # Create store_locations table

  1. New Tables
    - `store_locations`
      - `id` (uuid, primary key)
      - `name` (text, store name)
      - `location` (text, store address/location)
      - `hours` (text, operating hours)
      - `phone` (text, contact phone number)
      - `image` (text, store image URL)
      - `rating` (numeric, store rating)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on `store_locations` table
    - Add policy for public read access (since this is a store locator)

  3. Sample Data
    - Insert sample store locations for testing
*/

-- Create the store_locations table
CREATE TABLE IF NOT EXISTS store_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text NOT NULL,
  hours text DEFAULT 'Mon-Sat 09:00 AM - 5:00 PM',
  phone text,
  image text,
  rating numeric(2,1) DEFAULT 4.0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE store_locations ENABLE ROW LEVEL SECURITY;

-- Create policy for public read access (store locator should be publicly accessible)
CREATE POLICY "Allow public read access to store locations"
  ON store_locations
  FOR SELECT
  TO public
  USING (true);

-- Create policy for authenticated users to insert/update (for admin purposes)
CREATE POLICY "Allow authenticated users to manage stores"
  ON store_locations
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_store_locations_updated_at
  BEFORE UPDATE ON store_locations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data for testing
INSERT INTO store_locations (name, location, hours, phone, rating) VALUES
  ('GudGum Downtown', '123 Main Street, Downtown, City Center', 'Mon-Sat 09:00 AM - 9:00 PM, Sun 10:00 AM - 6:00 PM', '+1-555-0101', 4.5),
  ('GudGum Mall Plaza', '456 Shopping Mall, Plaza District', 'Mon-Sun 10:00 AM - 10:00 PM', '+1-555-0102', 4.3),
  ('GudGum Westside', '789 West Avenue, Westside Neighborhood', 'Mon-Fri 08:00 AM - 8:00 PM, Sat-Sun 09:00 AM - 7:00 PM', '+1-555-0103', 4.7),
  ('GudGum Express', '321 Quick Stop Lane, Business District', 'Mon-Fri 07:00 AM - 7:00 PM', '+1-555-0104', 4.2),
  ('GudGum Superstore', '654 Mega Center Blvd, Suburban Area', 'Mon-Sun 08:00 AM - 11:00 PM', '+1-555-0105', 4.6);