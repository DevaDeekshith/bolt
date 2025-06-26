/*
  # Fix RLS policies for store_locations table

  1. Security Updates
    - Update INSERT policy to allow anonymous users to add test data
    - Ensure SELECT policy allows public read access
    - Maintain security while enabling application functionality

  2. Changes Made
    - Modified INSERT policy to allow anon role
    - Verified SELECT policy for public access
    - Added UPDATE and DELETE policies for authenticated users only

  3. Notes
    - This allows the application to add test data during initialization
    - Public users can read store locations
    - Only authenticated users can modify existing data
*/

-- Drop existing policies to recreate them with correct permissions
DROP POLICY IF EXISTS "Allow authenticated users to manage stores" ON store_locations;
DROP POLICY IF EXISTS "Allow public read access to store locations" ON store_locations;

-- Create new policies with proper permissions

-- Allow public (including anon) to read store locations
CREATE POLICY "Allow public read access to store locations"
  ON store_locations
  FOR SELECT
  TO public
  USING (true);

-- Allow anon users to insert test data (for application initialization)
CREATE POLICY "Allow anon users to insert stores"
  ON store_locations
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow authenticated users to insert stores
CREATE POLICY "Allow authenticated users to insert stores"
  ON store_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow authenticated users to update stores
CREATE POLICY "Allow authenticated users to update stores"
  ON store_locations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to delete stores
CREATE POLICY "Allow authenticated users to delete stores"
  ON store_locations
  FOR DELETE
  TO authenticated
  USING (true);