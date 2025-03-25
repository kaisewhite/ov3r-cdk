import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";

import { SharedServicesStack } from "../shared";
import { FargateStack as DefaultFargateService } from "../fargate/default";
import { FargateStack as WebSvcFargateService } from "../fargate/web-svc";
import { services } from "../../../properties/index";
import { addStandardTags } from "../../../helpers/tag_resources";
import { PostgresStack } from "../fargate/postgres";

export interface MainStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly project: string;
  readonly vpcId: string;
  readonly domain: string;
  readonly imageTag: string;
  readonly certificate?: string;
  readonly whitelist?: Array<{ address: string; description: string }>;
  readonly loadBalancerDns?: string;
  readonly nlbLoadBalancerDns?: string;
}
export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    // Create tagging props for the main stack
    const mainStackTaggingProps = {
      project: props.project,
      service: "main",
      environment: props.environment,
      customTags: {
        Stack: "main",
      },
    };

    // Add tags to the stack itself
    addStandardTags(this, mainStackTaggingProps);

    const shared = new SharedServicesStack(this, `${props.environment}-${props.project}-shared-services-cdk`, {
      stackName: `${props.environment}-${props.project}-shared-services-cdk`,
      environment: props.environment,
      project: props.project,
      domain: props.domain,
      vpcId: props.vpcId,
      whitelist: props.whitelist,
      certificate: `${props.certificate}`,
      env: { account: this.account, region: this.region },
      tags: {
        Environment: props.environment,
        Project: props.project,
        Service: "shared",
      },
    });



    services.forEach((service) => {
      /**************************** COMPUTE RESOURCES ********************************/
      if (service.envs.includes(props.environment)) {
        switch (service.name) {
          case "postgres":
            const postgres = new PostgresStack(this, `${props.environment}-${props.project}-${service.name}-cdk`, {
              stackName: `${props.environment}-${props.project}-${service.name}-cdk`,
              environment: props.environment,
              project: props.project,
              nlbLoadBalancerDns: props.nlbLoadBalancerDns,
              hostHeaders: service.properties[props.environment].hostHeaders,
              service: service.name,
              memoryLimitMiB: service.properties[props.environment].memoryLimitMiB,
              cpu: service.properties[props.environment].cpu,
              vpcId: props.vpcId,
              whitelist: props.whitelist,
              env: { account: this.account, region: this.region },
              description: "Postgres database running on docker/fargate",
              tags: {
                Environment: props.environment,
                Project: props.project,
                Service: service.name,
              },
            });
            break;
          case "comprehend-web-svc":
            const webSvc = new WebSvcFargateService(this, `${props.environment}-${props.project}-${service.name}-cdk`, {
              stackName: `${props.environment}-${props.project}-${service.name}-cdk`,
              environment: props.environment,
              project: props.project,
              microService: true,
              service: service.name,
              description: "Rest API Service that communicates with RDS Postgres",
              desiredCount: service.properties[props.environment].desiredCount,
              secretVariables: service.secrets,
              internetFacing: false,
              healthCheck: service.healthCheck!,
              targetGroupPriority: service.properties[props.environment].priority,
              imageTag: props.imageTag,
              domain: props.domain,
              loadBalancerDns: props.loadBalancerDns,
              certificate: props.certificate,
              hostHeaders: service.properties[props.environment].hostHeaders,
              github: service.github!,
              vpcId: props.vpcId,
              whitelist: props.whitelist,
              memoryLimitMiB: service.properties[props.environment].memoryLimitMiB,
              cpu: service.properties[props.environment].cpu,
              env: { account: this.account, region: this.region },
              tags: {
                Environment: props.environment,
                Project: props.project,
                Service: service.name,
              },
            });
            webSvc.addDependency(shared);
            break;
          default:
            const defaultService = new DefaultFargateService(this, `${props.environment}-${props.project}-${service.name}-cdk`, {
              stackName: `${props.environment}-${props.project}-${service.name}-cdk`,
              environment: props.environment,
              project: props.project,
              microService: true,
              service: service.name,
              description: "Rest API Service that communicates with RDS Postgres",
              desiredCount: service.properties[props.environment].desiredCount,
              secretVariables: service.secrets,
              internetFacing: false,
              healthCheck: service.healthCheck!,
              targetGroupPriority: service.properties[props.environment].priority,
              imageTag: props.imageTag,
              domain: props.domain,
              loadBalancerDns: props.loadBalancerDns,
              certificate: props.certificate,
              hostHeaders: service.properties[props.environment].hostHeaders,
              github: service.github!,
              vpcId: props.vpcId,
              whitelist: props.whitelist,
              memoryLimitMiB: service.properties[props.environment].memoryLimitMiB,
              cpu: service.properties[props.environment].cpu,
              env: { account: this.account, region: this.region },
              tags: {
                Environment: props.environment,
                Project: props.project,
                Service: service.name,
              },
            });
            defaultService.addDependency(shared);
        }
      }
    });
  }
}
