import { ProcessorInterface } from '../types.js';
import { KnowledgeProductProcessor } from './knowledge-product/processor.js';
import { Logger } from '../utils/logger.js';

export class ProcessorFactory {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  getProcessor(resultType: string): ProcessorInterface {
    const normalizedType = resultType.toLowerCase().replace(/[_-]/g, '');
    
    switch (normalizedType) {
      case 'knowledgeproduct':
      case 'kp':
        return new KnowledgeProductProcessor(this.logger);
      
      // Aquí se pueden agregar más procesadores para otros tipos de resultados
      // case 'policybrief':
      //   return new PolicyBriefProcessor(this.logger);
      // case 'dataset':
      //   return new DatasetProcessor(this.logger);
      
      default:
        throw new Error(`No processor found for result type: ${resultType}`);
    }
  }

  getSupportedTypes(): string[] {
    return [
      'knowledge_product',
      'kp'
      // Aquí se agregarían otros tipos soportados
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