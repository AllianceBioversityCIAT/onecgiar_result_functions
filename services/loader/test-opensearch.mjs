import { OpenSearchClient } from './src/clients/opensearch.js';

async function testOpenSearchConnection() {
  console.log('🔍 Testing OpenSearch connection...');
  
  // Usar localhost para pruebas si no hay endpoint configurado
  const client = new OpenSearchClient('http://localhost:9200', 'test-prms');
  
  try {
    // Test 1: Crear índice
    console.log('📝 Creating test index...');
    await client.ensureIndex('knowledge_product');
    console.log('✅ Index created/verified successfully');
    
    // Test 2: Indexar documento de prueba
    console.log('📋 Indexing test document...');
    const testResult = {
      tenant: 'test',
      type: 'knowledge_product',
      op: 'create',
      result_type_id: 6,
      result_level_id: 4,
      idempotencyKey: 'test-' + Date.now(),
      received_at: new Date().toISOString(),
      title: 'Test Knowledge Product',
      description: 'This is a test document',
      lead_center: 'Test Center'
    };
    
    const indexResponse = await client.indexResult(testResult);
    console.log('✅ Document indexed successfully:', indexResponse.result);
    
    // Test 3: Buscar documento usando alias global
    console.log('🔍 Searching for test document via global alias...');
    const searchResponse = await client.searchAll({
      query: {
        match: {
          title: 'Test Knowledge Product'
        }
      }
    });
    
    console.log('✅ Search completed via alias. Found:', searchResponse.hits?.total?.value || 0, 'documents');
    
    // Test 4: Buscar documento usando índice físico específico
    console.log('🔍 Searching for test document via physical index...');
    const physicalSearchResponse = await client.searchByType('knowledge_product', {
      query: {
        match: {
          title: 'Test Knowledge Product'
        }
      }
    });
    
    console.log('✅ Search completed via physical index. Found:', physicalSearchResponse.hits?.total?.value || 0, 'documents');    console.log('🌐 Searching via global alias...');
    const aliasResponse = await client.search('test-prms', {
      query: {
        match: {
          title: 'Test Knowledge Product'
        }
      }
    });
    console.log('✅ Alias search found:', aliasResponse.hits?.total?.value || 0, 'documents');
    
    console.log('🎉 All OpenSearch tests passed!');
    
  } catch (error) {
    console.error('❌ OpenSearch test failed:', error);
    
    // Mostrar algunas sugerencias de troubleshooting
    console.log('\n🔧 Troubleshooting suggestions:');
    console.log('1. Make sure OpenSearch is running on localhost:9200');
    console.log('2. Check if you need authentication (set OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD)');
    console.log('3. Verify SSL/TLS settings');
    console.log('4. Try with Docker: docker run -p 9200:9200 -e "discovery.type=single-node" opensearchproject/opensearch:latest');
  }
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testOpenSearchConnection().catch(console.error);
}

export { testOpenSearchConnection };
