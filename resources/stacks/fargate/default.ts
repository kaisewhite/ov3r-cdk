//import * as cdk from "aws-cdk-lib/core";
import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import { PipelineStack } from "../../pipelines/index";
import * as applicationautoscaling from "aws-cdk-lib/aws-applicationautoscaling";
import * as destinations from "aws-cdk-lib/aws-logs-destinations";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Route53CreateCNAMEStack } from "../../../resources/stacks/shared/index";

const mgmt = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

export interface FargateStackStackProps extends cdk.StackProps {
  readonly environment: string;
  //
  readonly project: string;
  readonly service: string;
  readonly internetFacing: boolean;
  readonly healthCheck: string;
  readonly imageTag: string;
  readonly desiredCount: number;
  readonly secretVariables: string[] | undefined;
  readonly vpcId: string;
  readonly domain: string;
  readonly github: string;
  readonly memoryLimitMiB: number;
  readonly cpu: number;
  readonly certificate?: string;
  readonly targetGroupPriority?: number;
  readonly microService?: boolean;
  readonly hostHeaders?: string[] | undefined;
  readonly loadBalancerDnsName: string;
  readonly containerPort?: number;
  readonly whitelist?: Array<{ address: string; description: string }>;
}
export class FargateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FargateStackStackProps) {
    super(scope, id, props);

    /************************************************** VARIABLES ******************************************************* */

    const prefix = `${props.environment}-${props.project}-${props.service}`;

    const secrets = new secretsmanager.Secret(this, `${prefix}-secret`, {
      secretName: prefix,

      secretObjectValue: {
        PUBLICA_API_TOKEN: cdk.SecretValue.unsafePlainText(""),
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      description: `Environment Variables for ${props.service} lambda fn`,
    });

    // Generate container secrets based on the specified list of secret names.
    const generateSecrets = (list: string[] | undefined) => {
      let containerSecrets: { [key: string]: any } = {};
      list?.forEach((item) => {
        containerSecrets[item] = ecs.Secret.fromSecretsManager(secrets, item);
      });
      return containerSecrets;
    };

    /************************************************** IMPORTS ******************************************************* */

    const vpc = ec2.Vpc.fromLookup(this, `importing-${prefix}-vpc`, { isDefault: false, vpcId: props.vpcId });

    var fargateCluster = ecs.Cluster.fromClusterAttributes(this, `import-${prefix}-fargate-cluster`, {
      clusterName: `${props.project}`,
      vpc: vpc,
      securityGroups: [],
    });

    const ecrRepository = ecr.Repository.fromRepositoryArn(
      this,
      `import-${prefix}-ecr-repository`,
      `arn:aws:ecr:${this.region}:${process.env.CDK_DEFAULT_ACCOUNT}:repository/${props.project}-${props.service}`
    );

    /**************************************************************************************** */

    const documentStorageBucket = new s3.Bucket(this, `${prefix}-document-storage`, {
      bucketName: `${prefix}-document-storage`,
      versioned: false,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      accessControl: s3.BucketAccessControl.BUCKET_OWNER_FULL_CONTROL,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
      publicReadAccess: true,
    });

    const ecsTaskRole = new iam.Role(this, `${prefix}-ecs-task-role`, {
      assumedBy: new iam.CompositePrincipal(
        new iam.AccountPrincipal(`${process.env.CDK_DEFAULT_ACCOUNT}`),
        new iam.ServicePrincipal("ecs-tasks.amazonaws.com")
      ),
      roleName: `${prefix}-ecs-task-role`,
    });

    secrets.grantRead(ecsTaskRole);
    ecrRepository.grantPullPush(new iam.ArnPrincipal(ecsTaskRole.roleArn));
    documentStorageBucket.grantReadWrite(ecsTaskRole);

    /**
     * This permission is needed so the ecs task can pull the image from the mgmt account
     */
    ecsTaskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: [`arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:role/*`],
        actions: ["sts:AssumeRole"],
      })
    );

    ecsTaskRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"));

    ecsTaskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        resources: ["*"],
        actions: [
          "logs:*",
          "s3:*",
          "kms:*",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ec2:*",
          "rds:*",
          "ecs:*",
          "secretsmanager:*",
          "rekognition:*",
          "sqs:sendmessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "ses:SendEmail",
          "sns:CreatePlatformEndpoint",
          "sns:SetEndpointAttributes",
          "sns:Publish",
          "sns:ListEndpointsByPlatformApplication",
          "sns:DeleteEndpoint",
        ],
      })
    );

    const logGroup = new logs.LogGroup(this, `${prefix}-container-log-group`, {
      logGroupName: `ecs/container/${props.project}/${props.environment}/${props.service}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    /************************************ FARGATE *********************************/

    /**
     * SECURITY
     */
    const fargateSecurityGroup = new ec2.SecurityGroup(this, `${prefix}-fargate-security-group`, {
      vpc: vpc,
      securityGroupName: `${prefix}-fargate`,
      allowAllOutbound: true,
    });

    cdk.Tags.of(fargateSecurityGroup).add("Name", `${prefix}-fargate`);
    cdk.Tags.of(fargateSecurityGroup).add("Environment", props.environment);
    cdk.Tags.of(fargateSecurityGroup).add("Service", props.service);
    cdk.Tags.of(fargateSecurityGroup).add("Project", props.project);

    fargateSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.tcp(80), `Allow TCP Traffic for ${vpc.vpcId}`);
    fargateSecurityGroup.addIngressRule(ec2.Peer.ipv4(vpc.vpcCidrBlock), ec2.Port.allIcmp(), "Allow all ICMP traffic");
    props.whitelist?.forEach((ip) => {
      fargateSecurityGroup.addIngressRule(ec2.Peer.ipv4(ip.address), ec2.Port.tcp(80), `Allow TCP Traffic for ${ip.description}`);
      fargateSecurityGroup.addIngressRule(ec2.Peer.ipv4(ip.address), ec2.Port.allIcmp(), `Allow ICMP Ping for ${ip.description}`);
    });

    const taskDef = new ecs.FargateTaskDefinition(this, `${prefix}-fargate-task-definition`, {
      family: prefix,
      executionRole: ecsTaskRole,
      taskRole: ecsTaskRole,
      memoryLimitMiB: props.memoryLimitMiB,
      cpu: props.cpu,
    });

    const container = taskDef.addContainer(`${prefix}-fargate-container`, {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository, `${props.imageTag}`),
      memoryLimitMiB: props.memoryLimitMiB,
      cpu: props.cpu,
      essential: true,
      logging: new ecs.AwsLogDriver({
        streamPrefix: "ecs",
        logGroup: logGroup,
        multilinePattern: "^(INFO|DEBUG|WARN|ERROR|CRITICAL)",
      }),
      healthCheck: {
        command: ["CMD-SHELL", "curl -f http://localhost:80/ || exit 1"],
        interval: cdk.Duration.seconds(15),
        retries: 5,
        startPeriod: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(10),
      },
      portMappings: [
        {
          containerPort: 80,
          protocol: ecs.Protocol.TCP,
          hostPort: 80,
        },
      ],
      secrets: generateSecrets(props.secretVariables),
      environment: {
        REGION: this.region,
        PORT: `80`,
        HOST_HEADER: props.hostHeaders?.[0] ?? "",
        NODE_ENV: props.environment,
        S3_BUCKET_NAME: documentStorageBucket.bucketName,
      },
    });

    /**
     * FARGATE
     * The weight determines the proportion of tasks that should be placed on instances associated
     * with this capacity provider relative to the total weight of all strategies.
     * So, for example, if FARGATE_SPOT is set with a weight of 2 and FARGATE is set with a weight of 1
     * then in this case, for every 3 tasks, 2 will be placed on Fargate Spot instances,
     * and 1 will be placed on regular Fargate instances.
     */
    const capacityProviderStrategies = [
      {
        capacityProvider: "FARGATE_SPOT",
        weight: props.desiredCount === 0 ? 1 : props.desiredCount,
      },
    ];

    //Define service
    const fargateService = new ecs.FargateService(this, `${prefix}-fargate-service`, {
      serviceName: props.service,
      desiredCount: props.desiredCount,
      cluster: fargateCluster,
      deploymentController: { type: ecs.DeploymentControllerType.ECS },
      platformVersion: ecs.FargatePlatformVersion.LATEST,
      taskDefinition: taskDef,
      vpcSubnets: { subnets: vpc.privateSubnets, onePerAz: true },
      assignPublicIp: false,
      securityGroups: [fargateSecurityGroup],
      healthCheckGracePeriod: cdk.Duration.seconds(15),
      minHealthyPercent: 50,
      maxHealthyPercent: 200,
      capacityProviderStrategies: capacityProviderStrategies,
    });

    fargateService.applyRemovalPolicy(cdk.RemovalPolicy.DESTROY);

    //if (props.environment === "prod") {
    const scalingPolicy = fargateService.autoScaleTaskCount({
      minCapacity: props.desiredCount != 0 ? props.desiredCount : 1,
      maxCapacity: props.desiredCount != 0 ? props.desiredCount * 5 : 2,
    });

    scalingPolicy.scaleOnCpuUtilization(`${prefix}-cpu-autoscaling`, {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
      policyName: `${prefix}-cpu-autoscaling`,
    });

    scalingPolicy.scaleOnMemoryUtilization(`${prefix}-memory-autoscaling`, {
      targetUtilizationPercent: 80,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
      policyName: `${prefix}-memory-autoscaling`,
    });

    cdk.Tags.of(scalingPolicy).add(`Environment`, `${props.environment}`);
    //}

    /***************************** TARGET GROUP *****************************/

    if (props.hostHeaders != undefined) {
      const targetGroup = new elbv2.ApplicationTargetGroup(this, `${prefix}-target-group`, {
        port: 80,
        vpc: vpc,
        protocol: elbv2.ApplicationProtocol.HTTP,
        healthCheck: {
          interval: cdk.Duration.seconds(15),
          path: props.healthCheck,
          healthyHttpCodes: "200",
          timeout: cdk.Duration.seconds(10),
          unhealthyThresholdCount: 5,
          healthyThresholdCount: 2,
        },
        targetGroupName: `${prefix}`,
        targets: [fargateService],
        deregistrationDelay: cdk.Duration.seconds(10),
      });
      //Import HTTPS Listener from ./shared
      const HTTPSListener = elbv2.ApplicationListener.fromApplicationListenerAttributes(this, `${prefix}-https-listener`, {
        listenerArn: cdk.Fn.importValue(`${props.environment}-${props.project}-https-listener-arn`),
        securityGroup: ec2.SecurityGroup.fromSecurityGroupId(
          this,
          `imported-${prefix}-load-balancer-sg-id`,
          cdk.Fn.importValue(`${props.environment}-${props.project}-load-balancer-sg-id`),
          {
            allowAllOutbound: true,
            mutable: true,
          }
        ),
      });

      //Setup Listener Action
      HTTPSListener.addAction(`${prefix}-https-listener-action`, {
        priority: props.targetGroupPriority,
        conditions: [elbv2.ListenerCondition.hostHeaders(props.hostHeaders)],
        action: elbv2.ListenerAction.forward([targetGroup]),
      });

      cdk.Tags.of(targetGroup).add(`Environment`, `${props.environment}`);
      cdk.Tags.of(HTTPSListener).add(`Environment`, `${props.environment}`);
    }

    /************************************ CODEPIPELINE STACK ******************************************** */
    /**
     * Adding if condition so that this stack only gets deployed once
     */

    if (this.region === "us-east-1") {
      const pipelineStack = new PipelineStack(this, `${prefix}-pipeline-cdk`, {
        stackName: `${prefix}-pipeline-cdk`,
        env: mgmt,
        description: `Codepipeline resources for ${props.service}`,
        terminationProtection: false,
        project: props.project,
        vpcId: `${process.env.MGMT_VPC}`, //MGMT VPC
        service: props.service,
        ecsCluster: props.project,
        ecsService: fargateService.serviceName,
        desiredCount: props.desiredCount,
        roleARN: ecsTaskRole.roleArn,
        environment: props.environment,
        github: props.github,
        ecrURI: `${process.env.CDK_DEFAULT_ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/${props.project}-${props.service}`, //ecrRepository.repositoryUri,
        targetBranch: props.imageTag,
        imageTag: props.imageTag,
      });

      cdk.Tags.of(pipelineStack).add(`Environment`, `${props.environment}`);

      console.log(`Logging props.loadBalancerDnsName: ${props.loadBalancerDnsName}`);

     /*  new Route53CreateCNAMEStack(this, `${prefix}-route53-cname-stack`, {
        stackName: `${prefix}-route53-cname-stack`,
        env: mgmt,
        environment: props.environment,
        service: props.service,
        project: props.project,
        value: props.loadBalancerDnsName,
        hostedZoneName: `${process.env.DOMAIN}`,
        recordName: props.hostHeaders?.[0] ?? "",
      });   */

    }

    /************************** TAGS *************************************/

    const taggedResources = [container, fargateService, ecsTaskRole, logGroup, fargateSecurityGroup, taskDef];
    taggedResources.forEach((resource) => {
      cdk.Tags.of(resource).add(`Environment`, `${props.environment}`);
    });
  }
}
