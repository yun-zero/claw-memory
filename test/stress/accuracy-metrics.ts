interface EvaluationResult {
  recall: number;
  precision: number;
  mrr: number;
  ndcg: number;
}

interface QueryGroundTruth {
  query: string;
  expected_domain: string;
  expected_conv_ids: string[];
}

export function calculateMetrics(
  retrievedIds: string[],
  groundTruth: QueryGroundTruth,
  k: number = 10
): EvaluationResult {
  const topK = retrievedIds.slice(0, k);
  const relevant = groundTruth.expected_conv_ids;

  // Recall@K
  const relevantRetrieved = topK.filter(id => relevant.includes(id)).length;
  const recall = relevant.length > 0 ? relevantRetrieved / relevant.length : 0;

  // Precision@K
  const precision = topK.length > 0 ? relevantRetrieved / topK.length : 0;

  // MRR
  let rr = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.includes(topK[i])) {
      rr = 1 / (i + 1);
      break;
    }
  }
  const mrr = rr;

  // NDCG
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.includes(topK[i])) {
      dcg += 1 / Math.log2(i + 2);
    }
  }
  const idcg = relevant.reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
  const ndcg = idcg > 0 ? dcg / idcg : 0;

  return { recall, precision, mrr, ndcg };
}
