import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { addStandardTags } from "../../../helpers/tag_resources";
import * as iam from "aws-cdk-lib/aws-iam";
import * as efs from "aws-cdk-lib/aws-efs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as backup from "aws-cdk-lib/aws-backup";
import * as route53 from "aws-cdk-lib/aws-route53";

const mgmt = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION };

/**
 * Configuration properties for the PostgreSQL Stack
 */
export interface PostgresStackProps extends cdk.StackProps {
    readonly project: string;
    readonly service: string;
    readonly environment: string;
    readonly loadBalancerDns?: string;
    readonly hostHeader: string;
    readonly vpcId: string;
    readonly memoryLimitMiB: number;
    readonly cpu: number;
    readonly whitelist?: Array<{ address: string; description: string }>;
    readonly nlbLoadBalancerDns?: string;
}

/**
 * Stack that deploys a PostgreSQL database using ECS Fargate with:
 * - EFS for persistent storage with automatic backups
 * - Network Load Balancer for direct TCP access
 * - Security groups for access control
 * - CloudWatch logging
 * - Route53 DNS records
 */
export class PostgresStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: PostgresStackProps) {
        super(scope, id, props);

        // =============================================
        // Core Infrastructure Setup
        // =============================================
        const prefix = `${props.environment}-${props.project}-${props.service}`;
        const vpc = ec2.Vpc.fromLookup(this, `importing-${prefix}-vpc`, {
            isDefault: false,
            vpcId: props.vpcId
        });

        // Stack tagging configuration
        const taggingProps = {
            project: props.project,
            service: props.service,
            environment: props.environment,
            prefix: prefix,
            customTags: {
                ...(props.tags || {}),
                Stack: "fargate",
            },
        };

        // =============================================
        // IAM Role Configuration
        // =============================================
        const role = new iam.Role(this, `${prefix}-role`, {
            assumedBy: new iam.CompositePrincipal(
                new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
                new iam.ServicePrincipal("ecs.amazonaws.com")
            ),
            roleName: `${prefix}-role`,
        });

        // Allow role assumption
        role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: [
                    `arn:aws:iam::${process.env.CDK_DEFAULT_ACCOUNT}:role/*`,
                    `arn:aws:iam::${this.account}:role/*`
                ],
                actions: ["sts:AssumeRole"],
            })
        );

        // Grant AWS service permissions
        role.addToPrincipalPolicy(
            new iam.PolicyStatement({
                effect: iam.Effect.ALLOW,
                resources: ["*"],
                actions: [
                    "logs:*",
                    "s3:*",
                    "kms:*",
                    "ecr:*",
                    "ecs:*",
                    "rds:*",
                    "secretsmanager:*",
                    "iam:PassRole",
                    "elasticfilesystem:*"
                ],
            })
        );

        // =============================================
        // ECS Cluster Configuration
        // =============================================
        const ecsCluster = ecs.Cluster.fromClusterAttributes(this, `import-${prefix}-fargate-cluster`, {
            clusterName: `${props.project}`,
            vpc: vpc,
            securityGroups: [],
        });

        // =============================================
        // Security Group Configuration
        // =============================================
        // Main security group for PostgreSQL service
        const securityGroup = new ec2.SecurityGroup(this, `${prefix}-sg`, {
            vpc: vpc,
            description: `Security group for Postgres service in ${props.environment}`,
            allowAllOutbound: true,
            securityGroupName: `${prefix}`,
        });

        // Configure inbound rules
        securityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(80),
            "Allow HTTP from within VPC"
        );
        securityGroup.addIngressRule(
            securityGroup,
            ec2.Port.tcp(5432),
            "Allow PostgreSQL from self"
        );
        securityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.allIcmp(),
            "Allow ICMP from within VPC"
        );

        // Add whitelist rules if specified
        props.whitelist?.forEach((ip) => {
            securityGroup.addIngressRule(
                ec2.Peer.ipv4(ip.address),
                ec2.Port.tcp(5432),
                `Allow PostgreSQL for ${ip.description}`
            );
            securityGroup.addIngressRule(
                ec2.Peer.ipv4(ip.address),
                ec2.Port.tcp(80),
                `Allow TCP Traffic for ${ip.description}`
            );
            securityGroup.addIngressRule(
                ec2.Peer.ipv4(ip.address),
                ec2.Port.allIcmp(),
                `Allow ICMP Ping for ${ip.description}`
            );
        });

        // =============================================
        // EFS Storage Configuration
        // =============================================
        // Security group for EFS access
        const efsSecurityGroup = new ec2.SecurityGroup(this, `${prefix}-efs-security-group`, {
            vpc: vpc,
            securityGroupName: `${prefix}-efs`,
            description: `Security group for EFS mount targets in ${props.environment}`,
        });

        // Configure EFS security rules
        efsSecurityGroup.addIngressRule(
            securityGroup,
            ec2.Port.tcp(2049),
            "Allow NFS from Fargate tasks"
        );
        efsSecurityGroup.addIngressRule(
            ec2.Peer.ipv4(vpc.vpcCidrBlock),
            ec2.Port.tcp(2049),
            "Allow NFS from VPC"
        );

        // Tag EFS security group
        cdk.Tags.of(efsSecurityGroup).add("environment", prefix);
        cdk.Tags.of(efsSecurityGroup).add("Name", `${prefix}-efs`);

        // Create EFS filesystem
        const fileSystem = new efs.FileSystem(this, `${prefix}-efs`, {
            vpc: vpc,
            vpcSubnets: {
                subnets: vpc.privateSubnets,
                availabilityZones: vpc.availabilityZones,
            },
            encrypted: true,
            removalPolicy: cdk.RemovalPolicy.RETAIN,
            fileSystemName: `${prefix}`,
            securityGroup: efsSecurityGroup,
            enableAutomaticBackups: true,
            performanceMode: efs.PerformanceMode.GENERAL_PURPOSE,
            throughputMode: efs.ThroughputMode.BURSTING,
        });

        // Tag EFS filesystem
        cdk.Tags.of(fileSystem).add("environment", prefix);

        // =============================================
        // Backup Configuration
        // =============================================
        const backupVault = new backup.BackupVault(this, `${prefix}-backup-vault`, {
            backupVaultName: `${prefix}-vault`,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        const backupPlan = new backup.BackupPlan(this, `${prefix}-backup-plan`, {
            backupPlanName: `${prefix}-plan`,
            backupVault: backupVault,
        });

        // Configure daily backups
        backupPlan.addRule(
            new backup.BackupPlanRule({
                ruleName: "DailyBackup",
                scheduleExpression: cdk.aws_events.Schedule.cron({ hour: "2", minute: "0" }),
                deleteAfter: cdk.Duration.days(2),
            })
        );

        backupPlan.addSelection(`${prefix}-efs-selection`, {
            resources: [
                backup.BackupResource.fromArn(fileSystem.fileSystemArn),
            ],
        });

        // =============================================
        // EFS Access Point Configuration
        // =============================================
        const accessPoint = new efs.AccessPoint(this, `${prefix}-access-point`, {
            fileSystem: fileSystem,
            path: '/postgresql',
            createAcl: {
                ownerGid: '999',
                ownerUid: '999',
                permissions: '755'
            },
            posixUser: {
                gid: '999',
                uid: '999'
            },
        });

        // =============================================
        // Task Definition Configuration
        // =============================================
        // Configure EFS volume for task
        const ecsEFSVolume: ecs.Volume = {
            name: "efs-volume",
            efsVolumeConfiguration: {
                fileSystemId: fileSystem.fileSystemId,
                transitEncryption: "ENABLED",
                authorizationConfig: {
                    accessPointId: accessPoint.accessPointId,
                    iam: "ENABLED"
                },
                rootDirectory: "/",
            },
        };

        // Create CloudWatch log group
        const logGroup = new logs.LogGroup(this, `${prefix}-logs`, {
            logGroupName: `/ecs/${prefix}`,
            retention: logs.RetentionDays.TWO_MONTHS,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
        });

        // Create task definition
        const taskDefinition = new ecs.FargateTaskDefinition(this, `${prefix}-task-definition`, {
            family: `${props.environment}-${props.service}`,
            executionRole: role,
            taskRole: role,
            memoryLimitMiB: props.memoryLimitMiB,
            cpu: props.cpu,
            volumes: [ecsEFSVolume],
        });

        // Create container definition
        const container = taskDefinition.addContainer(`${prefix}-fargate-container`, {
            image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/postgres:17.4"),
            memoryLimitMiB: props.memoryLimitMiB,
            cpu: props.cpu,
            essential: true,
            stopTimeout: cdk.Duration.seconds(120),
            environment: {
                POSTGRES_USER: "postgres",
                POSTGRES_PASSWORD: "R8D6Fy3csyg",
                POSTGRES_DB: "postgres",
                PGDATA: "/var/lib/postgresql/data/pgdata"
            },
            logging: new ecs.AwsLogDriver({
                streamPrefix: "ecs",
                logGroup: logGroup,
                multilinePattern: "^(INFO|DEBUG|WARN|ERROR|CRITICAL)",
            }),
            healthCheck: {
                command: ["CMD-SHELL", "pg_isready -U postgres"],
                interval: cdk.Duration.seconds(30),
                timeout: cdk.Duration.seconds(5),
                retries: 3,
                startPeriod: cdk.Duration.seconds(60),
            },
            portMappings: [{
                containerPort: 5432,
                protocol: ecs.Protocol.TCP,
            }],
        });

        // Configure container mount points and parameters
        container.addMountPoints({
            containerPath: "/var/lib/postgresql/data",
            readOnly: false,
            sourceVolume: ecsEFSVolume.name,
        });

        container.addUlimits({
            name: ecs.UlimitName.NOFILE,
            softLimit: 65536,
            hardLimit: 65536
        });

        // =============================================
        // Fargate Service Configuration
        // =============================================
        const service = new ecs.FargateService(this, `${prefix}-fargate-service`, {
            cluster: ecsCluster,
            taskDefinition: taskDefinition,
            assignPublicIp: false,
            desiredCount: 1,
            securityGroups: [securityGroup],
            vpcSubnets: {
                subnets: vpc.privateSubnets,
                availabilityZones: vpc.availabilityZones,
            },
            enableExecuteCommand: true,
            serviceName: props.service
        });

        // Ensure service depends on EFS
        service.node.addDependency(fileSystem);

        /**
             * EventBridge Rules for ecs-service Service
             * Start Fargate Service at 05:00 EST (10:00 UTC)
             * Stop ecs-service at 23:00 EST (04:00 UTC next day)
             */
        // Start Fargate Service service at 05:00 EST (10:00 UTC)
        const startRule = new events.Rule(this, `${prefix}-start-ecs-service-rule`, {
            schedule: events.Schedule.cron({
                minute: "0",
                hour: "14",
                month: "*",
                day: "*",
            }),
            enabled: false,
            ruleName: `${props.service}-start-ecs-service`,
            description: `Start Fargate Service service at 05:00 EST (10:00 UTC)`,
            targets: [
                new targets.AwsApi({
                    service: "ECS",
                    action: "updateService",
                    parameters: {
                        cluster: ecsCluster.clusterName,
                        service: `${service.serviceName}`,
                        desiredCount: 1,
                    },
                    catchErrorPattern: "ServiceNotFoundException",
                    policyStatement: new iam.PolicyStatement({
                        actions: ["ecs:UpdateService"],
                        resources: [service.serviceArn],
                    }),
                }),
            ],
        });
        addStandardTags(startRule, taggingProps);

        // Stop ecs-service service at 23:00 EST (04:00 UTC next day)
        const stopRule = new events.Rule(this, `${prefix}-stop-ecs-service-rule`, {
            schedule: events.Schedule.cron({
                minute: "0",
                hour: "2", // 04:00 UTC = 23:00 EST (previous day)
                month: "*",
                day: "*",
            }),
            ruleName: `${props.service}-stop-ecs-service`,
            description: `Stop ecs-service service at 23:00 EST (04:00 UTC next day)`,
            targets: [
                new targets.AwsApi({
                    service: "ECS",
                    action: "updateService",
                    parameters: {
                        cluster: ecsCluster.clusterName,
                        service: `${service.serviceName}`,
                        desiredCount: 0,
                    },
                    catchErrorPattern: "ServiceNotFoundException",
                    policyStatement: new iam.PolicyStatement({
                        actions: ["ecs:UpdateService"],
                        resources: [service.serviceArn],
                    }),
                }),
            ],
        });
        addStandardTags(stopRule, taggingProps);

        // =============================================
        // Load Balancer Configuration
        // =============================================
        const networkLoadBalancer = new elbv2.NetworkLoadBalancer(this, `${prefix}-network-load-balancer`, {
            vpc: vpc,
            internetFacing: true,
            vpcSubnets: {
                subnets: vpc.privateSubnets,
                availabilityZones: vpc.availabilityZones,
            },
            loadBalancerName: `${prefix}`,
            securityGroups: [securityGroup],
        });

        cdk.Tags.of(networkLoadBalancer).add("Name", `${prefix}`);

        const targetGroup = new elbv2.NetworkTargetGroup(this, `${prefix}-network-load-balancer-tg`, {
            targetGroupName: `${prefix}`,
            targets: [service],
            protocol: elbv2.Protocol.TCP,
            port: 5432,
            vpc: vpc,
            healthCheck: {
                protocol: elbv2.Protocol.TCP,
                port: "5432",
                interval: cdk.Duration.seconds(6),
                timeout: cdk.Duration.seconds(5),
                unhealthyThresholdCount: 2,
                healthyThresholdCount: 2,
            },
        });

        const listener = networkLoadBalancer.addListener(`${prefix}-network-load-balancer-listener`, {
            port: 5432,
            defaultTargetGroups: [targetGroup]
        });

        // =============================================
        // Export NLB DNS Name
        // =============================================
        new cdk.CfnOutput(this, `${prefix}-nlb-dns-name`, {
            value: networkLoadBalancer.loadBalancerDnsName,
            description: "The DNS name for the Network Load Balancer",
            exportName: `${prefix}-nlb-dns-name`,
        });

        // =============================================
        // DNS Configuration
        // =============================================

        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, `${prefix}-importing-hosted-zone`,
            {
                zoneName: `${props.project}.internal`,
                hostedZoneId: cdk.Fn.importValue(`${props.environment}-${props.project}-internal-zone-id`)
            }
        );

        new route53.CnameRecord(this, `${prefix}-route53-cname-record`, {
            domainName: networkLoadBalancer.loadBalancerDnsName,
            zone: hostedZone,
            comment: `Create the CNAME record for ${prefix} in ${props.project}.internal`,
            recordName: `${props.service}.${props.project}.internal`,
            ttl: cdk.Duration.minutes(30),
        });

    }
}
