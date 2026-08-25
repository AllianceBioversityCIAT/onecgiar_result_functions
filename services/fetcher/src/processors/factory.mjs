import { KnowledgeProductProcessor } from "./knowledge-product/processor.mjs";
import { CapacitySharingProcessor } from "./capacity-sharing/processor.mjs";
import { InnovationDevelopmentProcessor } from "./innovation-development/processor.mjs";
import { InnovationUseProcessor } from "./innovation-use/processor.mjs";
import { OtherOutputProcessor } from "./other-output/processor.mjs";
import { OtherOutcomeProcessor } from "./other-outcome/processor.mjs";
import { PolicyChangeProcessor } from "./policy-change/processor.mjs";
import { Logger } from "../utils/logger.mjs";

export class ProcessorFactory {
  logger;
  externalApiClient;

  /**
   * `externalApiClient` is built once per request in the ingest handler, carrying the caller's
   * validated API key. Injecting the client rather than the key keeps the credential out of the
   * processors entirely — and out of the `result` objects they serialise to S3 and echo back in
   * the HTTP response (NFR-1).
   */
  constructor(logger, externalApiClient) {
    this.logger = logger;
    this.externalApiClient = externalApiClient;
  }

  getProcessor(resultType) {
    const normalizedType = resultType.toLowerCase().replace(/[_-]/g, "");

    switch (normalizedType) {
      case "knowledgeproduct":
      case "kp":
        return new KnowledgeProductProcessor(this.logger, this.externalApiClient);

      case "capacitysharing":
      case "cs":
        return new CapacitySharingProcessor(this.logger, this.externalApiClient);

      case "innovationdevelopment":
      case "id":
        return new InnovationDevelopmentProcessor(this.logger, this.externalApiClient);

      case "innovationuse":
      case "iu":
        return new InnovationUseProcessor(this.logger, this.externalApiClient);

      case "otheroutput":
      case "oo":
        return new OtherOutputProcessor(this.logger, this.externalApiClient);

      case "otheroutcome":
      case "oc":
        return new OtherOutcomeProcessor(this.logger, this.externalApiClient);

      case "policychange":
      case "pc":
        return new PolicyChangeProcessor(this.logger, this.externalApiClient);

      default:
        throw new Error(`No processor found for result type: ${resultType}`);
    }
  }

  getSupportedTypes() {
    return [
      "knowledge_product",
      "kp",
      "capacity_sharing",
      "cs",
      "innovation_development",
      "id",
      "innovation_use",
      "iu",
      "other_output",
      "oo",
      "other_outcome",
      "oc",
      "policy_change",
      "pc",
    ];
  }

  isTypeSupported(resultType) {
    try {
      this.getProcessor(resultType);
      return true;
    } catch {
      return false;
    }
  }
}
