const rawNode = process.env.OPENSEARCH_NODE || 'https://localhost:9200';
const OPENSEARCH_NODE = rawNode.replace(/\/+$/, '');
const OPENSEARCH_USERNAME = process.env.OPENSEARCH_USERNAME || 'admin';
const OPENSEARCH_PASSWORD = process.env.OPENSEARCH_PASSWORD || 'admin';

export async function searchOpenSearch(index: string, query: any, size: number = 20) {
  console.log(`Searching OpenSearch index: ${index} with size: ${size}`);
  console.log(`Query: ${JSON.stringify(query)}`);
  const normalizedIndex = index.trim();
  const path = normalizedIndex === '_all' ? '/_search' : `/${normalizedIndex}/_search`;
  const url = `${OPENSEARCH_NODE}${path}`;

  const auth = Buffer.from(`${OPENSEARCH_USERNAME}:${OPENSEARCH_PASSWORD}`).toString('base64');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({
      query,
      size,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenSearch error: ${response.status} ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}
