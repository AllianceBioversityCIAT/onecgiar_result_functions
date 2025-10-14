// Ejemplo de evento de prueba para el loader
export const testEvent = {
  source: "client.star",
  "detail-type": "knowledge_product.create",
  detail: {
    idempotencyKey: "test-kp-001",
    correlationId: "test-correlation-123",
    ts: Date.now(),
    payload: {
      tenant: "star",
      type: "knowledge_product",
      op: "create",
      received_at: new Date().toISOString(),
      idempotencyKey: "test-kp-001",
      submitted_by: {
        email: "test@cgiar.org",
        name: "Test User",
        submitted_date: new Date().toISOString(),
      },
      lead_center: "Alliance of Bioversity International and CIAT",
      title: "Test Knowledge Product",
      description: "This is a test knowledge product for loader testing",
      toc_mapping: [
        {
          science_program_id: "SP12",
          aow_compose_code: "SP12-AOW01",
          result_title: "Test Result",
          result_indicator_description: "Test indicator",
          result_indicator_type_name: "# Of Knowledge Products",
        },
      ],
      geo_focus: {
        scope_code: 1,
        scope_label: "Global",
      },
      contributing_center: ["Alliance"],
      contributing_partners: ["Test Partner"],
      evidence: ["Test evidence"],
      contributing_bilateral_projects: ["Test project"],
      knowledge_product: {
        handle: "test-handle-001",
        knowledge_product_type: "Journal Article",
        metadataCG: {
          source: "Test Source",
          accessibility: true,
          is_isi: true,
          is_peer_reviewed: true,
          issue_year: 2025,
        },
        licence: "CC-BY 4.0",
      },
    },
  },
};

// Array de múltiples resultados
export const testBatchEvent = {
  source: "client.star",
  "detail-type": "batch.create",
  detail: {
    correlationId: "batch-test-123",
    payload: {
      results: [
        testEvent.detail.payload,
        {
          ...testEvent.detail.payload,
          idempotencyKey: "test-kp-002",
          title: "Second Test Knowledge Product",
        },
        {
          ...testEvent.detail.payload,
          idempotencyKey: "test-kp-003",
          title: "Third Test Knowledge Product",
        },
      ],
    },
  },
};

// Función para probar localmente
export async function testHandler() {
  const { handler } = await import("./src/handler.js");

  console.log("🧪 Testing single result...");
  const singleResult = await handler(testEvent);
  console.log("✅ Single result:", JSON.stringify(singleResult, null, 2));

  console.log("\n🧪 Testing batch results...");
  const batchResult = await handler(testBatchEvent);
  console.log("✅ Batch result:", JSON.stringify(batchResult, null, 2));
}

// Ejecutar si es llamado directamente
if (import.meta.url === `file://${process.argv[1]}`) {
  testHandler().catch(console.error);
}
