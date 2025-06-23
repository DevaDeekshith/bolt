import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kgtjdbyzxaearguhvrja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndGpkYnl6eGFlYXJndWh2cmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTIyNzAsImV4cCI6MjA2NjE4ODI3MH0.m_8lQ2ohMPzoUs5-zSyneI5ACdl-yX0XyjI_j_dUN0g';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test database connection
export const testConnection = async () => {
  try {
    console.log('Testing Supabase connection...');
    console.log('URL:', supabaseUrl);
    console.log('Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
    
    // Test basic connection with a simple query using existing columns
    const { data, error, count } = await supabase
      .from('store_locations')
      .select('Name', { count: 'exact' });
    
    if (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: error.message,
        details: error
      };
    }
    
    console.log('Connection successful! Row count:', count);
    return {
      success: true,
      rowCount: count
    };
  } catch (error) {
    console.error('Connection test exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    };
  }
};

// Fetch stores with detailed error handling - Updated for simplified schema
export const fetchStores = async () => {
  try {
    console.log('Fetching stores from store_locations table...');
    
    const { data, error } = await supabase
      .from('store_locations')
      .select('Name, Location'); // Only select the columns that exist
    
    if (error) {
      console.error('Error fetching stores:', error);
      console.error('Error details:', {
        message: error.message,
        details: error.details,
        hint: error.hint,
        code: error.code
      });
      throw error;
    }
    
    console.log('Successfully fetched stores:', data);
    console.log('Number of stores found:', data?.length || 0);
    
    if (data && data.length > 0) {
      console.log('Sample store data:', data[0]);
      console.log('Available columns:', Object.keys(data[0]));
    }
    
    return data || [];
  } catch (error) {
    console.error('Fetch stores exception:', error);
    throw error;
  }
};

// Test table structure - Updated for simplified schema
export const inspectTableStructure = async () => {
  try {
    console.log('Inspecting table structure...');
    
    // Directly fetch one row to see structure
    const { data: sampleData, error: sampleError } = await supabase
      .from('store_locations')
      .select('Name, Location')
      .limit(1);
    
    if (sampleError) {
      console.error('Table structure inspection failed:', sampleError);
      return {
        success: false,
        error: sampleError.message,
        details: sampleError
      };
    }
    
    return {
      success: true,
      method: 'sample_row',
      columns: sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : ['Name', 'Location'],
      sampleData: sampleData
    };
  } catch (error) {
    console.error('Table inspection exception:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    };
  }
};

// Real-time subscription for store updates
export const subscribeToStoreUpdates = (
  onInsert: (payload: any) => void,
  onUpdate: (payload: any) => void,
  onDelete: (payload: any) => void
) => {
  console.log('Setting up real-time subscription for store_locations...');
  
  const channel = supabase
    .channel('store-locations-changes')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'store_locations'
      },
      (payload) => {
        console.log('New store inserted:', payload);
        onInsert(payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'store_locations'
      },
      (payload) => {
        console.log('Store updated:', payload);
        onUpdate(payload);
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'DELETE',
        schema: 'public',
        table: 'store_locations'
      },
      (payload) => {
        console.log('Store deleted:', payload);
        onDelete(payload);
      }
    )
    .subscribe((status) => {
      console.log('Realtime subscription status:', status);
    });

  // Return cleanup function
  return () => {
    console.log('Unsubscribing from store updates');
    supabase.removeChannel(channel);
  };
};

// Helper function to transform raw store data - Updated for simplified schema
export const transformStoreData = (rawStore: any) => {
  console.log('Transforming store data:', rawStore);
  
  return {
    // Generate a unique ID since the table doesn't have one
    id: `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: rawStore.Name || rawStore.name || 'Store',
    location: rawStore.Location || rawStore.location || '',
    // Add default values for missing fields
    hours: 'Mon-Sat 09:00 AM - 5:00 PM',
    phone: null,
    image: null,
    // Add mock rating for demonstration
    rating: 4.0 + Math.random()
  };
};

// Comprehensive database diagnostics - Updated for simplified schema
export const runDatabaseDiagnostics = async () => {
  console.log('🔍 Running comprehensive database diagnostics...');
  
  const results = {
    connection: null as any,
    tableStructure: null as any,
    sampleData: null as any,
    permissions: null as any
  };
  
  try {
    // Test 1: Basic connection
    console.log('📡 Testing basic connection...');
    results.connection = await testConnection();
    
    // Test 2: Table structure
    console.log('🏗️ Inspecting table structure...');
    results.tableStructure = await inspectTableStructure();
    
    // Test 3: Sample data
    console.log('📊 Fetching sample data...');
    try {
      const sampleData = await fetchStores();
      results.sampleData = {
        success: true,
        count: sampleData.length,
        data: sampleData
      };
    } catch (error) {
      results.sampleData = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
    
    // Test 4: Permissions check - Updated to use Name column
    console.log('🔐 Testing permissions...');
    try {
      // Test SELECT permission using Name column
      const { error: selectError } = await supabase
        .from('store_locations')
        .select('Name')
        .limit(1);
      
      results.permissions = {
        select: !selectError,
        selectError: selectError?.message,
        note: 'Only testing SELECT permission for simplified schema'
      };
    } catch (error) {
      results.permissions = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
  } catch (error) {
    console.error('Diagnostics failed:', error);
  }
  
  console.log('📋 Diagnostics complete:', results);
  return results;
};