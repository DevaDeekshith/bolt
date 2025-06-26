import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://kgtjdbyzxaearguhvrja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndGpkYnl6eGFlYXJndWh2cmphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA2MTIyNzAsImV4cCI6MjA2NjE4ODI3MH0.m_8lQ2ohMPzoUs5-zSyneI5ACdl-yX0XyjI_j_dUN0g';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Test database connection with automatic table detection
export const testConnection = async () => {
  try {
    console.log('Testing Supabase connection and detecting tables...');
    console.log('URL:', supabaseUrl);
    console.log('Key (first 20 chars):', supabaseKey.substring(0, 20) + '...');
    
    // First, try to get all tables in the public schema
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .like('table_name', '%store%');
    
    if (tablesError) {
      console.log('Could not query information_schema, trying direct table access...');
      
      // Try common table names
      const possibleTableNames = [
        'stores',
        'store_locations', 
        'locations',
        'gudgum_stores',
        'store_data',
        'shop_locations'
      ];
      
      for (const tableName of possibleTableNames) {
        try {
          const { data, error, count } = await supabase
            .from(tableName)
            .select('*', { count: 'exact' })
            .limit(1);
          
          if (!error) {
            console.log(`Found table: ${tableName} with ${count} rows`);
            if (data && data.length > 0) {
              console.log('Sample data structure:', Object.keys(data[0]));
            }
            return {
              success: true,
              tableName,
              rowCount: count,
              sampleData: data,
              columns: data && data.length > 0 ? Object.keys(data[0]) : []
            };
          }
        } catch (e) {
          console.log(`Table ${tableName} not found`);
        }
      }
      
      return {
        success: false,
        error: 'No store-related tables found. Please check table name.',
        availableTables: []
      };
    }
    
    console.log('Available store-related tables:', tables);
    
    if (tables && tables.length > 0) {
      // Try the first store-related table found
      const tableName = tables[0].table_name;
      const { data, error, count } = await supabase
        .from(tableName)
        .select('*', { count: 'exact' })
        .limit(1);
      
      if (error) {
        return {
          success: false,
          error: error.message,
          tableName,
          details: error
        };
      }
      
      return {
        success: true,
        tableName,
        rowCount: count,
        sampleData: data,
        columns: data && data.length > 0 ? Object.keys(data[0]) : []
      };
    }
    
    return {
      success: false,
      error: 'No store-related tables found',
      availableTables: tables
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

// Dynamic table name - will be set after detection
let CURRENT_TABLE_NAME = 'store_locations'; // default fallback

// Set the table name dynamically
export const setTableName = (tableName: string) => {
  CURRENT_TABLE_NAME = tableName;
  console.log('Updated table name to:', tableName);
};

// Fetch stores with automatic table detection and column mapping
export const fetchStores = async () => {
  try {
    console.log(`Fetching stores from ${CURRENT_TABLE_NAME} table...`);
    
    // First, test connection and detect table structure
    const connectionTest = await testConnection();
    
    if (!connectionTest.success) {
      throw new Error(`Table detection failed: ${connectionTest.error}`);
    }
    
    // Update table name if detected
    if (connectionTest.tableName) {
      setTableName(connectionTest.tableName);
    }
    
    console.log(`Using table: ${CURRENT_TABLE_NAME}`);
    console.log('Available columns:', connectionTest.columns);
    
    // Fetch all data from the detected table
    const { data, error } = await supabase
      .from(CURRENT_TABLE_NAME)
      .select('*');
    
    if (error) {
      console.error('Error fetching stores:', error);
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

// Inspect table structure with automatic detection
export const inspectTableStructure = async () => {
  try {
    console.log('Inspecting table structure...');
    
    const connectionTest = await testConnection();
    
    if (!connectionTest.success) {
      return {
        success: false,
        error: connectionTest.error,
        details: connectionTest
      };
    }
    
    return {
      success: true,
      tableName: connectionTest.tableName,
      columns: connectionTest.columns,
      sampleData: connectionTest.sampleData,
      rowCount: connectionTest.rowCount
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

// Real-time subscription with dynamic table name
export const subscribeToStoreUpdates = (
  onInsert: (payload: any) => void,
  onUpdate: (payload: any) => void,
  onDelete: (payload: any) => void
) => {
  console.log(`Setting up real-time subscription for ${CURRENT_TABLE_NAME}...`);
  
  const channel = supabase
    .channel(`${CURRENT_TABLE_NAME}-changes`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: CURRENT_TABLE_NAME
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
        table: CURRENT_TABLE_NAME
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
        table: CURRENT_TABLE_NAME
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

// Smart column mapping for different table structures
const mapColumnNames = (rawData: any): any => {
  if (!rawData || typeof rawData !== 'object') {
    return rawData;
  }
  
  const columnMappings = {
    // Name variations
    name: ['name', 'Name', 'store_name', 'storeName', 'title', 'Title'],
    // Location variations  
    location: ['location', 'Location', 'address', 'Address', 'store_address', 'storeAddress'],
    // Hours variations
    hours: ['hours', 'Hours', 'operating_hours', 'operatingHours', 'store_hours', 'storeHours', 'timings'],
    // Phone variations
    phone: ['phone', 'Phone', 'contact', 'Contact', 'phone_number', 'phoneNumber', 'mobile'],
    // Image variations
    image: ['image', 'Image', 'photo', 'Photo', 'picture', 'Picture', 'image_url', 'imageUrl'],
    // Rating variations
    rating: ['rating', 'Rating', 'score', 'Score', 'stars', 'Stars'],
    // ID variations
    id: ['id', 'Id', 'ID', 'store_id', 'storeId', 'uuid']
  };
  
  const mapped: any = {};
  const availableKeys = Object.keys(rawData);
  
  // Map each field to the first available column that matches
  for (const [targetField, possibleColumns] of Object.entries(columnMappings)) {
    for (const possibleColumn of possibleColumns) {
      if (availableKeys.includes(possibleColumn)) {
        mapped[targetField] = rawData[possibleColumn];
        break;
      }
    }
  }
  
  // If no name found, use the first text column
  if (!mapped.name) {
    const firstTextColumn = availableKeys.find(key => 
      typeof rawData[key] === 'string' && rawData[key].length > 0
    );
    if (firstTextColumn) {
      mapped.name = rawData[firstTextColumn];
    }
  }
  
  // If no location found, use the second text column
  if (!mapped.location) {
    const textColumns = availableKeys.filter(key => 
      typeof rawData[key] === 'string' && rawData[key].length > 0 && key !== mapped.name
    );
    if (textColumns.length > 0) {
      mapped.location = rawData[textColumns[0]];
    }
  }
  
  return mapped;
};

// Enhanced transform function with smart column mapping
export const transformStoreData = (rawStore: any) => {
  console.log('Transforming store data:', rawStore);
  
  // Apply smart column mapping
  const mappedStore = mapColumnNames(rawStore);
  
  return {
    // Generate a unique ID if not present
    id: mappedStore.id || `store_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: mappedStore.name || 'Store',
    location: mappedStore.location || '',
    // Add default values for missing fields
    hours: mappedStore.hours || 'Mon-Sat 09:00 AM - 5:00 PM',
    phone: mappedStore.phone || null,
    image: mappedStore.image || null,
    // Add mock rating if not present
    rating: mappedStore.rating || (4.0 + Math.random())
  };
};

// Comprehensive database diagnostics with auto-detection
export const runDatabaseDiagnostics = async () => {
  console.log('🔍 Running comprehensive database diagnostics...');
  
  const results = {
    connection: null as any,
    tableDetection: null as any,
    tableStructure: null as any,
    sampleData: null as any,
    permissions: null as any
  };
  
  try {
    // Test 1: Basic connection and table detection
    console.log('📡 Testing connection and detecting tables...');
    results.connection = await testConnection();
    results.tableDetection = results.connection;
    
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
        data: sampleData.slice(0, 3), // First 3 records
        transformedSample: sampleData.length > 0 ? transformStoreData(sampleData[0]) : null
      };
    } catch (error) {
      results.sampleData = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error
      };
    }
    
    // Test 4: Permissions check
    console.log('🔐 Testing permissions...');
    try {
      if (results.connection.success && results.connection.tableName) {
        const tableName = results.connection.tableName;
        
        // Test SELECT permission
        const { error: selectError } = await supabase
          .from(tableName)
          .select('*')
          .limit(1);
        
        results.permissions = {
          select: !selectError,
          selectError: selectError?.message,
          tableName: tableName
        };
      } else {
        results.permissions = {
          error: 'No table detected for permission testing'
        };
      }
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

// Auto-initialize table detection
export const initializeTableDetection = async () => {
  try {
    console.log('🚀 Initializing automatic table detection...');
    const result = await testConnection();
    
    if (result.success && result.tableName) {
      setTableName(result.tableName);
      console.log(`✅ Successfully detected and configured table: ${result.tableName}`);
      return result;
    } else {
      console.warn('⚠️ No suitable table found. Please check your Supabase setup.');
      return result;
    }
  } catch (error) {
    console.error('❌ Table detection failed:', error);
    throw error;
  }
};