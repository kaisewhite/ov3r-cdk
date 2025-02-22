import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

import * as dotenv from "dotenv";
dotenv.config();

const config = {
  prod: {
    west: { account: process.env.CDK_PROD_ACCOUNT, region: process.env.CDK_US_WEST_1_REGION },
    east: { account: process.env.CDK_PROD_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  },
  dev: {
    west: { account: process.env.CDK_DEV_ACCOUNT, region: process.env.CDK_US_WEST_1_REGION },
    east: { account: process.env.CDK_DEV_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  },
  mgmt: {
    west: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_US_WEST_1_REGION },
    east: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  },
};

import { MainStack } from "../resources/stacks/main/index";
import { MGMTStack } from "../resources/stacks/shared/index";

export class Ov3RCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const whitelist = [
      { address: "10.0.0.0/24", description: "mgmt us-east-1 vpc" },
      { address: "10.1.0.0/16", description: "dev us-east-1 vpc" },
      { address: "10.2.0.0/16", description: "prod us-east-1 vpc" },
      { address: "10.3.0.0/16", description: "dev us-west-1 vpc" },
      { address: "10.4.0.0/16", description: "prod us-west-1 vpc" },
      { address: "10.5.0.0/24", description: "prod us-west-1 vpc" },
    ];

    const mgmtStack = new MGMTStack(this, "mgmt-ov3r-cdk", {
      project: "ov3r",
      stackName: "mgmt-ov3r-cdk",
      env: config.mgmt.east,
      slackWorkspaceId: "T05AXT2C65P",
      pipelineSlackChannelId: "C08EL3YB490",
    });

    const devStack = new MainStack(this, `dev-ov3r-cdk`, {
      environment: "dev",
      project: "ov3r",
      domain: `${process.env.DOMAIN}`,
      imageTag: "dev",
      whitelist: whitelist,
      vpcId: `${process.env.DEV_VPC}`,
      certificate: "arn:aws:acm:us-east-1:896502667345:certificate/e4634438-8a7d-46ff-b06e-1790f5a46460",
      stackName: "dev-ov3r-cdk",
      env: config.dev.east,
      description: "dev stack for all ov3r dependencies",
    });
    devStack.addDependency(mgmtStack);

    /*   const prodStack = new MainStack(this, `prod-ov3r-cdk`, {
      environment: "prod",
      project: "ov3r",
      domain: `${process.env.DOMAIN}`,
      imageTag: "master",
      whitelist: whitelist,
      vpcId: `${process.env.PROD_VPC}`,
      certificate: "arn:aws:acm:us-east-1:736548610362:certificate/48cd8dab-3fe9-40cd-b1aa-975014d35a4f",
      stackName: "prod-ov3r-cdk",
      env: config.prod.east,
      description: "production stack for all ov3r dependencies",
    });
    prodStack.addDependency(mgmtStack); */
  }
}
