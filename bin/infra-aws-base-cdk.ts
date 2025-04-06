#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { InfraAwsBaseCdkStack } from "../lib/infra-aws-base-cdk-stack";

const app = new cdk.App();
new InfraAwsBaseCdkStack(app, "InfraAwsBaseCdkStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION },
  stackName: "infra-aws-base-cdk",
  description: "Deploys infrastructure",
});
