import { ProcessorInterface } from "../types.js";
import { KnowledgeProductProcessor } from "./knowledge-product/processor.js";
import { CapacitySharingProcessor } from "./capacity-sharing/processor.js";
import { InnovationDevelopmentProcessor } from "./innovation-development/processor.js";
import { OtherOutputProcessor } from "./other-output/processor.js";
import { Logger } from "../utils/logger.js";

export class ProcessorFactory {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getProcessor(resultType: string): ProcessorInterface {
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

      case "otheroutput":
      case "oo":
        return new OtherOutputProcessor(this.logger);

      default:
        throw new Error(`No processor found for result type: ${resultType}`);
    }
  }

  getSupportedTypes(): string[] {
    return [
      "knowledge_product",
      "kp",
      "capacity_sharing",
      "cs",
      "innovation_development",
      "id",
      "other_output",
      "oop",
    ];
  }

  isTypeSupported(resultType: string): boolean {
    try {
      this.getProcessor(resultType);
      return true;
    } catch {
      return false;
    }
  }
}
