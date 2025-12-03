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

  constructor(logger) {
    this.logger = logger;
  }

  getProcessor(resultType) {
    const normalizedType = resultType.toLowerCase().replace(/[_-]/g, "");

    switch (normalizedType) {
      case "knowledgeproduct":
      case "kp":
        return new KnowledgeProductProcessor(this.logger);

      case "capacitysharing":
      case "cs":
        return new CapacitySharingProcessor(this.logger);

      case "innovationdevelopment":
      case "id":
        return new InnovationDevelopmentProcessor(this.logger);

      case "innovationuse":
      case "iu":
        return new InnovationUseProcessor(this.logger);

      case "otheroutput":
      case "oo":
        return new OtherOutputProcessor(this.logger);

      case "otheroutcome":
      case "oc":
        return new OtherOutcomeProcessor(this.logger);

      case "policychange":
      case "pc":
        return new PolicyChangeProcessor(this.logger);

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
