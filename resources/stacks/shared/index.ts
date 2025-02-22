import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as chatbot from "aws-cdk-lib/aws-chatbot";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { services } from "../../../properties";

export interface MGMTStackProps extends cdk.StackProps {
  readonly project: string;
  readonly slackWorkspaceId: string; //The WorkspaceID which can be found in AWS Chatbot Console
  readonly pipelineSlackChannelId: string; //The Slack Workspace ID which is found in Slack->Channel -> View Channel Details -> About
}
export class MGMTStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: MGMTStackProps) {
    super(scope, id, props);

    /************************************* ECR Resources ****************************/

    services.forEach((service) => {
      switch (service.type) {
        case "fargate":
          const repository = new ecr.Repository(this, `${props.project}-${service.name}-repository`, {
            repositoryName: `${props.project}-${service.name}`,
            imageScanOnPush: true,
          });

          repository.addLifecycleRule({ tagPrefixList: ["dev", "stage", "master"], maxImageCount: 1 });
          repository.addLifecycleRule({ maxImageAge: cdk.Duration.days(90), tagPrefixList: ["dev", "stage"] });
          repository.addLifecycleRule({ tagStatus: ecr.TagStatus.UNTAGGED, maxImageCount: 1 });
          repository.grantPullPush(new iam.AccountRootPrincipal());
          repository.grantPullPush(new iam.AccountPrincipal(process.env.CDK_DEV_ACCOUNT));
          repository.grantPullPush(new iam.AccountPrincipal(process.env.CDK_PROD_ACCOUNT));
          repository.grantPullPush(new iam.ServicePrincipal("ecs-tasks.amazonaws.com"));

          repository.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

          // Corrected Resource Policy
          repository.addToResourcePolicy(
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "ecr:BatchCheckLayerAvailability",
                "ecr:BatchGetImage",
                "ecr:CompleteLayerUpload",
                "ecr:GetDownloadUrlForLayer",
                "ecr:InitiateLayerUpload",
                "ecr:PutImage",
                "ecr:UploadLayerPart",
              ],
              principals: [
                new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
                new iam.ArnPrincipal("arn:aws:iam::366394957699:root"),
                new iam.ArnPrincipal("arn:aws:iam::896502667345:root"),
                new iam.ArnPrincipal("arn:aws:iam::736548610362:root"),
              ],
            })
          );

          cdk.Tags.of(repository).add(`Environment`, `shared`);
          break;

        default:
          break;
      }
    });

    /************************************* CHATBOT ****************************/

    const chatbotSlackRole = new iam.Role(this, `${props.project}-chatbot-slack-role`, {
      assumedBy: new iam.ServicePrincipal("chatbot.amazonaws.com"),
      roleName: `${props.project}-chatbot-slack-role`,
    });

    /*************************** SNS TOPIC ************************/

    const codePipelineSnsTopic = new sns.Topic(this, `${props.project}-codepipeline-sns-topic`, {
      displayName: `${props.project}-codepipeline`,
      topicName: `${props.project}-codepipeline`,
    });

    codePipelineSnsTopic.grantPublish(new iam.AccountRootPrincipal());
    codePipelineSnsTopic.grantPublish(new iam.ServicePrincipal("codestar-notifications.amazonaws.com"));

    new cdk.CfnOutput(this, `${props.project}-codepipeline-sns-topic-arn`, {
      value: codePipelineSnsTopic.topicArn,
      description: "The ARN for the SNS Topic",
      exportName: `${props.project}-codepipeline-sns-topic-arn`,
    });

    /************************************************** CHATBOT CONFIGURATION ******************************************************* */

    const channelConfiguration = new chatbot.SlackChannelConfiguration(this, `${props.project}-codepipeline-slack-channel-configuration`, {
      slackChannelConfigurationName: props.pipelineSlackChannelId,
      slackWorkspaceId: props.slackWorkspaceId,
      slackChannelId: props.pipelineSlackChannelId,
      role: chatbotSlackRole,
    });

    channelConfiguration.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);
    channelConfiguration.addNotificationTopic(codePipelineSnsTopic);

    /************************** TAGS *************************************/

    const taggedResources = [channelConfiguration, chatbotSlackRole, codePipelineSnsTopic];
    taggedResources.forEach((resource) => {
      cdk.Tags.of(resource).add(`Environment`, `shared`);
    });
  }
}

/****************************** NEW ******************************************/

export interface SharedServicesStackProps extends cdk.StackProps {
  readonly environment: string;
  readonly project: string;
  readonly domain: string;
  readonly vpcId: string;
  readonly certificate?: string;
  readonly whitelist?: Array<{ address: string; description: string }>;
}
export class SharedServicesStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SharedServicesStackProps) {
    super(scope, id, props);

    const prefix = `${props.environment}-${props.project}`;

    /**
     * CDK IMPORTS
     */
    const vpc = ec2.Vpc.fromLookup(this, `${prefix}-imported-vpc`, { isDefault: false, vpcId: props.vpcId });
    const importedCertificate = acm.Certificate.fromCertificateArn(this, `${props.environment}-imported-wildcard-certificate-arn`, `${props.certificate}`);

    /************************************************** ECS ******************************************************* */

    const cluster = new ecs.Cluster(this, `${prefix}-ecs-cluster`, {
      vpc: vpc,
      enableFargateCapacityProviders: true,
      containerInsights: true,
      clusterName: `${props.project}`,
    });

    /************************************************** SHARED APPLICATION LOAD BALANCER ******************************************************* */

    const loadBalancerSecurityGroup = new ec2.SecurityGroup(this, `${prefix}-alb-security-group`, {
      vpc: vpc,
      securityGroupName: `${prefix}-load-balancer`,
      allowAllOutbound: true,
    });

    loadBalancerSecurityGroup.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    cdk.Tags.of(loadBalancerSecurityGroup).add("Name", `${prefix}-load-balancer`);
    cdk.Tags.of(loadBalancerSecurityGroup).add("Environment", props.environment);
    cdk.Tags.of(loadBalancerSecurityGroup).add("Project", props.project);

    new cdk.CfnOutput(this, `${props.environment}-load-balancer-sg-id`, {
      value: loadBalancerSecurityGroup.securityGroupId,
      description: "The id for the load balancer security group",
      exportName: `${prefix}-load-balancer-sg-id`,
    });

    if (props.environment === "prod") {
      loadBalancerSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.allTraffic(), "Allow all traffic");
    }

    props.whitelist?.forEach((ip) => {
      loadBalancerSecurityGroup.addIngressRule(ec2.Peer.ipv4(`${ip.address}`), ec2.Port.allIcmp(), `Allow all traffic for ${ip.description}`);
      loadBalancerSecurityGroup.addIngressRule(ec2.Peer.ipv4(`${ip.address}`), ec2.Port.allTraffic(), `Allow all traffic for ${ip.description}`);
    });

    /**
     * CREATE ALB
     */
    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, `${prefix}-application-load-balancer`, {
      vpc: vpc,
      internetFacing: true,
      loadBalancerName: `${prefix}`,
      deletionProtection: false,
      vpcSubnets: { subnets: vpc.publicSubnets, availabilityZones: this.availabilityZones },
      ipAddressType: elbv2.IpAddressType.IPV4,
      securityGroup: loadBalancerSecurityGroup,
      idleTimeout: cdk.Duration.seconds(30),
    });


    cdk.Tags.of(loadBalancer).add("Name", prefix);
    cdk.Tags.of(loadBalancer).add("Environment", props.environment);
    cdk.Tags.of(loadBalancer).add("Project", props.project);

    loadBalancer.addRedirect({
      sourceProtocol: elbv2.ApplicationProtocol.HTTP,
      sourcePort: 80,
      targetProtocol: elbv2.ApplicationProtocol.HTTPS,
      targetPort: 443,
    });

    const HTTPSListener = loadBalancer.addListener(`${prefix}-https-listener`, {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [importedCertificate],
      open: true,
    });

    cdk.Tags.of(HTTPSListener).add("environment", props.environment);

    new cdk.CfnOutput(this, `${prefix}-https-listener-arn`, {
      value: HTTPSListener.listenerArn,
      description: "The ARN for the HTTPS Listener",
      exportName: `${prefix}-https-listener-arn`,
    });

    HTTPSListener.connections.allowFrom(loadBalancer, ec2.Port.tcp(80), `Allow connections from ${prefix} load balancer on port 80`);
    HTTPSListener.connections.allowFrom(loadBalancer, ec2.Port.tcp(443), `Allow connections from ${prefix} load balancer on port 443`);

    HTTPSListener.addAction(`${prefix}-default-action`, {
      action: elbv2.ListenerAction.fixedResponse(200, { messageBody: JSON.stringify({ response: 200, message: prefix }) }),
    });

    HTTPSListener.addAction("Fixed", {
      priority: 30,
      conditions: [elbv2.ListenerCondition.pathPatterns(["/healthcheck"])],
      action: elbv2.ListenerAction.fixedResponse(200, { messageBody: JSON.stringify({ response: 200, message: "healthy" }) }),
    });

    /************************** TAGS *************************************/

    const taggedResources = [loadBalancerSecurityGroup, loadBalancer, HTTPSListener];
    taggedResources.forEach((resource) => {
      cdk.Tags.of(resource).add(`Environment`, `${props.environment}`);
    });
  }
}


export interface Route53StackProps extends cdk.StackProps {
  readonly environment: string;
  readonly project: string;
  readonly service: string;
  readonly hostedZoneName: string;
  readonly recordName: string;
  readonly value: string;
}
export class Route53CreateCNAMEStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: Route53StackProps) {
    super(scope, id, props);

    const prefix = `${props.environment}-${props.project}-${props.service}`;

    const hostedZone = route53.HostedZone.fromLookup(this, `${prefix}-importing-hosted-zone`, {
      domainName: props.hostedZoneName, //e.g. example.com
    });

    new route53.CnameRecord(this, `${prefix}-route53-cname-record`, {
      domainName: props.value,
      zone: hostedZone,
      // the properties below are optional
      comment: `Create the CNAME record for ${prefix} in ${props.hostedZoneName}`,
      recordName: props.recordName,
      ttl: cdk.Duration.minutes(30),
    });



  }


}