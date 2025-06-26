import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kgtjdbyzxaearguhvrja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndGpkYnl6eGFlYXJndWh2cmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTIyNzAsImV4cCI6MjA2NjE4ODI3MH0.m_8lQ2ohMPzoUs5-zSyneI5ACdl-yX0XyjI_j_dUN0g';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test database connection with exact table and column names
export const testConnection = async () => {
  try {
    console.log('Testing Supabase connection to store_locations...');
    console.log('URL:', supabaseUrl);
    
    // Test with exact column names from your schema
    const { data, error, count } = await supabase
      .from('store_locations')
      .select('"Name", "Location"', { count: 'exact' });
    
    if (error) {
      console.error('Connection test failed:', error);
      return {
        success: false,
        error: error.message,
        details: error,
        hint: 'Make sure the table exists and has the correct permissions'
      };
    }
    
    console.log('✅ Connection successful!');
    console.log('Row count:', count);
    console.log('Sample data:', data);
    
    return {
      success: true,
      tableName: 'store_locations',
      rowCount: count,
      sampleData: data,
      columns: ['Name', 'Location']
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

// Fetch stores with exact column names
export const fetchStores = async () => {
  try {
    console.log('🔍 Fetching stores from store_locations table...');
    
    // Use exact column names with quotes to handle case sensitivity
    const { data, error } = await supabase
      .from('store_locations')
      .select('"Name", "Location"');
    
    if (error) {
      console.error('❌ Error fetching stores:', error);
      throw new Error(`Database error: ${error.message}. Please check if the table exists and has proper permissions.`);
    }
    
    console.log('✅ Successfully fetched stores:', data);
    console.log('📊 Number of stores found:', data?.length || 0);
    
    if (data && data.length > 0) {
      console.log('📝 Sample store data:', data[0]);
    } else {
      console.warn('⚠️ No stores found in the database');
    }
    
    return data || [];
  } catch (error) {
    console.error('💥 Fetch stores exception:', error);
    throw error;
  }
};

// Transform store data with exact column mapping
export const transformStoreData = (rawStore: any) => {
  console.log('🔄 Transforming store data:', rawStore);
  
  // Handle the exact column names from your schema
  const name = rawStore.Name || rawStore.name || 'Unnamed Store';
  const location = rawStore.Location || rawStore.location || 'Unknown Location';
  
  const transformed = {
    id: `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: name,
    location: location,
    hours: 'Mon-Sat 09:00 AM - 5:00 PM',
    phone: null,
    image: null,
    rating: 4.0 + Math.random()
  };
  
  console.log('✅ Transformed store:', transformed);
  return transformed;
};

// Real-time subscription
export const subscribeToStoreUpdates = (
  onInsert: (payload: any) => void,
  onUpdate: (payload: any) => void,
  onDelete: (payload: any) => void
) => {
  console.log('🔔 Setting up real-time subscription for store_locations...');
  
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
        console.log('➕ New store inserted:', payload);
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
        console.log('✏️ Store updated:', payload);
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
        console.log('🗑️ Store deleted:', payload);
        onDelete(payload);
      }
    )
    .subscribe((status) => {
      console.log('📡 Realtime subscription status:', status);
    });

  return () => {
    console.log('🔌 Unsubscribing from store updates');
    supabase.removeChannel(channel);
  };
};

// Add some test data if table is empty
export const addTestData = async () => {
  try {
    console.log('🧪 Adding test data to store_locations...');
    
    const testStores = [
      { Name: 'GudGum Downtown', Location: 'MG Road, Bangalore, Karnataka, India' },
      { Name: 'GudGum Mall', Location: 'Forum Mall, Koramangala, Bangalore, Karnataka, India' },
      { Name: 'GudGum Express', Location: 'Indiranagar, Bangalore, Karnataka, India' },
      { Name: 'GudGum Central', Location: 'Commercial Street, Bangalore, Karnataka, India' },
      { Name: 'GudGum Plaza', Location: 'Brigade Road, Bangalore, Karnataka, India' }
    ];
    
    const { data, error } = await supabase
      .from('store_locations')
      .insert(testStores)
      .select();
    
    if (error) {
      console.error('❌ Error adding test data:', error);
      return { success: false, error: error.message };
    }
    
    console.log('✅ Test data added successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('💥 Exception adding test data:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
};

// Comprehensive diagnostics
export const runDatabaseDiagnostics = async () => {
  console.log('🔍 Running comprehensive database diagnostics...');
  
  const results = {
    timestamp: new Date().toISOString(),
    connection: null as any,
    tableAccess: null as any,
    dataCount: null as any,
    sampleData: null as any,
    permissions: null as any,
    recommendations: [] as string[]
  };
  
  try {
    // Test 1: Basic connection
    console.log('📡 Testing connection...');
    results.connection = await testConnection();
    
    // Test 2: Table access
    console.log('🏗️ Testing table access...');
    try {
      const { count, error } = await supabase
        .from('store_locations')
        .select('*', { count: 'exact', head: true });
      
      results.tableAccess = {
        success: !error,
        count: count,
        error: error?.message
      };
    } catch (error) {
      results.tableAccess = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    // Test 3: Data retrieval
    console.log('📊 Testing data retrieval...');
    try {
      const stores = await fetchStores();
      results.dataCount = {
        success: true,
        count: stores.length,
        hasData: stores.length > 0
      };
      
      if (stores.length > 0) {
        results.sampleData = {
          raw: stores[0],
          transformed: transformStoreData(stores[0])
        };
      }
    } catch (error) {
      results.dataCount = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    // Test 4: Permissions
    console.log('🔐 Testing permissions...');
    try {
      // Test SELECT
      const { error: selectError } = await supabase
        .from('store_locations')
        .select('"Name"')
        .limit(1);
      
      // Test INSERT (will likely fail, but that's expected)
      const { error: insertError } = await supabase
        .from('store_locations')
        .insert({ Name: 'Test Store', Location: 'Test Location' })
        .select();
      
      results.permissions = {
        select: !selectError,
        insert: !insertError,
        selectError: selectError?.message,
        insertError: insertError?.message
      };
    } catch (error) {
      results.permissions = {
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
    
    // Generate recommendations
    if (!results.connection.success) {
      results.recommendations.push('Check Supabase URL and API key');
    }
    
    if (!results.tableAccess.success) {
      results.recommendations.push('Verify table "store_locations" exists in public schema');
    }
    
    if (results.dataCount.success && results.dataCount.count === 0) {
      results.recommendations.push('Add some test data to the store_locations table');
    }
    
    if (!results.permissions.select) {
      results.recommendations.push('Enable RLS policies for public read access');
    }
    
  } catch (error) {
    console.error('💥 Diagnostics failed:', error);
    results.recommendations.push('Check console for detailed error messages');
  }
  
  console.log('📋 Diagnostics complete:', results);
  return results;
};

// Quick setup function
export const quickSetup = async () => {
  console.log('🚀 Running quick setup...');
  
  try {
    // Test connection first
    const connectionTest = await testConnection();
    
    if (!connectionTest.success) {
      return {
        success: false,
        error: 'Connection failed',
        details: connectionTest
      };
    }
    
    // Check if we have data
    if (connectionTest.rowCount === 0) {
      console.log('📝 No data found, adding test data...');
      const testDataResult = await addTestData();
      
      if (testDataResult.success) {
        return {
          success: true,
          message: 'Setup complete with test data',
          testDataAdded: true
        };
      }
    }
    
    return {
      success: true,
      message: 'Setup complete',
      rowCount: connectionTest.rowCount
    };
    
  } catch (error) {
    console.error('💥 Quick setup failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};